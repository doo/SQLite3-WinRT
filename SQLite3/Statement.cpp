#include <assert.h>
#include <collection.h>
#include <ppltasks.h>

#include "Statement.h"
#include "Database.h"

namespace SQLite3 {
  static std::wstring toUtf16(const char* utf8String) {
    DWORD numCharacters = MultiByteToWideChar(CP_UTF8, 0, utf8String, -1, nullptr, 0);
    auto wideText = new std::wstring::value_type[numCharacters];
    MultiByteToWideChar(CP_UTF8, 0, utf8String, -1, wideText, numCharacters);
    std::wstring result(wideText);
    delete[] wideText;
    return result;
  }

  StatementPtr Statement::Prepare(sqlite3* sqlite, Platform::String^ sql) {
    sqlite3_stmt* statement;
    int ret = sqlite3_prepare16(sqlite, sql->Data(), -1, &statement, 0);

    if (ret != SQLITE_OK) {
      sqlite3_finalize(statement);
      throwSQLiteError(ret);
    }

    return StatementPtr(new Statement(statement));
  }

  Statement::Statement(sqlite3_stmt* statement)
    : statement(statement) {
  }

  Statement::~Statement() {
    sqlite3_finalize(statement);
  }

  void Statement::Bind(const SafeParameterVector& params) {
    for (SafeParameterVector::size_type i = 0; i < params.size(); ++i) {
      BindParameter(i + 1, params[i]);
    }
  }

  void Statement::Bind(ParameterMap^ params) {
    for (int i = 0; i < BindParameterCount(); ++i) {
      int index = i + 1;
      auto nameWithoutPrefix = BindParameterName(index).substr(1);
      auto name = ref new Platform::String(nameWithoutPrefix.data());
      if (params->HasKey(name)) {
        BindParameter(index, params->Lookup(name));
      }
    }
  }

  static inline uint64 FoundationTimeToUnixCompatible(Windows::Foundation::DateTime foundationTime){
    return (foundationTime.UniversalTime/10000)-11644473600000;
  }

  void Statement::BindParameter(int index, Platform::Object^ value) {
    if (value == nullptr) {
      sqlite3_bind_null(statement, index);
    } else {
      auto typeCode = Platform::Type::GetTypeCode(value->GetType());
      switch (typeCode) {
      case Platform::TypeCode::DateTime:
        sqlite3_bind_int64(statement, index, FoundationTimeToUnixCompatible(static_cast<Windows::Foundation::DateTime>(value)));
        break;
      case Platform::TypeCode::Double:
        sqlite3_bind_double(statement, index, static_cast<double>(value));
        break;
      case Platform::TypeCode::String:
        sqlite3_bind_text16(statement, index, static_cast<Platform::String^>(value)->Data(), -1, SQLITE_TRANSIENT);
        break;
      case Platform::TypeCode::Boolean:
        sqlite3_bind_int(statement, index, static_cast<Platform::Boolean>(value) ? 1 : 0);
        break;
      case Platform::TypeCode::Int8:
      case Platform::TypeCode::Int16:
      case Platform::TypeCode::Int32:
      case Platform::TypeCode::UInt8:
      case Platform::TypeCode::UInt16:
      case Platform::TypeCode::UInt32:
        sqlite3_bind_int(statement, index, static_cast<int>(value));
        break;
      case Platform::TypeCode::Int64:
      case Platform::TypeCode::UInt64:
        sqlite3_bind_int64(statement, index, static_cast<int64>(value));
        break;
      default: 
        throw ref new Platform::InvalidArgumentException();
      }
    }
  }

  int Statement::BindParameterCount() {
    return sqlite3_bind_parameter_count(statement);
  }

  std::wstring Statement::BindParameterName(int index) {
    return toUtf16(sqlite3_bind_parameter_name(statement, index));
  }

  int Statement::BindText(int index, Platform::String^ val) {
    return sqlite3_bind_text16(statement, index, val->Data(), -1, SQLITE_TRANSIENT);
  }

  int Statement::BindInt(int index, int64 val) {
    return sqlite3_bind_int64(statement, index, val);
  }

  int Statement::BindDouble(int index, double val) {
    return sqlite3_bind_double(statement, index, val);
  }

  int Statement::BindNull(int index) {
    return sqlite3_bind_null(statement, index);
  }

  void Statement::Run() {
    Step();
  }

  Row^ Statement::One() {
    return (Step() == SQLITE_ROW) ? GetRow() : nullptr;
  }

  Rows^ Statement::All() {
    auto rows = ref new Platform::Collections::Vector<Row^>();

    while (Step() == SQLITE_ROW) {
      rows->Append(GetRow());
    }
  
    return rows->GetView();
  }

  void Statement::Each(EachCallback^ callback) {
    while (Step() == SQLITE_ROW) {
      callback(GetRow());
    }
  }

  void notifyUnlock(void* args[], int nArgs) {
    assert(nArgs == 1);
    for (int i = 0; i < nArgs; i++) {
      ((Statement*)args[i])->NotifyUnlock();
    }
  }

  void Statement::NotifyUnlock() {
    ReleaseMutex(dbLockMutex);
  }

  int Statement::Step() {
    int ret = sqlite3_step(statement);
    if (ret == SQLITE_LOCKED) {
      // HACK, HACK, HACK! Extract the sqlite connection from the statement
      sqlite3* db = (sqlite3*)((void**)statement)[0];
      dbLockMutex = CreateMutexExW(NULL, NULL, CREATE_MUTEX_INITIAL_OWNER, NULL);
      ret = sqlite3_unlock_notify(db, &notifyUnlock, this);
      if (ret == SQLITE_LOCKED) {
        ReleaseMutex(dbLockMutex);
        return SQLITE_LOCKED;
      }
      WaitForSingleObjectEx(dbLockMutex, INFINITE, false);
      sqlite3_reset(statement);
      return Step();
    }
    if (ret != SQLITE_ROW && ret != SQLITE_DONE) {
      throwSQLiteError(ret);
    }

    return ret;
  }

  bool Statement::ReadOnly() const {
    return sqlite3_stmt_readonly(statement) != 0;
  }

  Row^ Statement::GetRow() {
    auto row = ref new Platform::Collections::Map<Platform::String^, Platform::Object^>();

    int columnCount = ColumnCount();
    for (int i = 0 ; i < columnCount; ++i) {
      auto name = ColumnName(i);
      row->Insert(name, GetColumn(i));
    }

    return row->GetView();
  }

  Platform::Object^ Statement::GetColumn(int index) {
    switch (ColumnType(index)) {
    case SQLITE_INTEGER:
      return ColumnInt(index);
    case SQLITE_FLOAT:
      return ColumnDouble(index);
    case SQLITE_TEXT:
      return ColumnText(index);
    case SQLITE_NULL:
      return nullptr;
    default:
      throw ref new Platform::FailureException();
    }
  }

  int Statement::ColumnCount() {
    return sqlite3_column_count(statement);
  }

  int Statement::ColumnType(int index) {
    return sqlite3_column_type(statement, index);
  }

  Platform::String^ Statement::ColumnName(int index) {
    return ref new Platform::String(static_cast<const wchar_t*>(sqlite3_column_name16(statement, index)));
  }

  Platform::String^ Statement::ColumnText(int index) {
    return ref new Platform::String(static_cast<const wchar_t*>(sqlite3_column_text16(statement, index)));
  }

  int64 Statement::ColumnInt(int index) {
    return sqlite3_column_int64(statement, index);
  }

  double Statement::ColumnDouble(int index) {
    return sqlite3_column_double(statement, index);
  }
}

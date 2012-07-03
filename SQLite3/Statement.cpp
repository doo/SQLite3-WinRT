#include <collection.h>
#include <ppltasks.h>
#include <Winerror.h>

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

      HRESULT hresult = MAKE_HRESULT(SEVERITY_ERROR, FACILITY_ITF, ret);
      throw ref new Platform::COMException(hresult);
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

  static inline uint64 FoundationTimeToUnixCompatible(Windows::Foundation::DateTime foundationTime) {
    return (foundationTime.UniversalTime / 10000) - 11644473600000;
  }

  void Statement::BindParameter(int index, Platform::Object^ value) {
    if (value == nullptr) {
      sqlite3_bind_null(statement, index);
    } else {
      switch (Platform::Type::GetTypeCode(value->GetType())) {
      case Platform::TypeCode::DateTime:
        sqlite3_bind_int64(statement, index, FoundationTimeToUnixCompatible(static_cast<Windows::Foundation::DateTime>(value)));
        break;
      case Platform::TypeCode::Double:
        sqlite3_bind_double(statement, index, static_cast<double>(value));
        break;
      case Platform::TypeCode::String:
        sqlite3_bind_text16(statement, index, static_cast<Platform::String^>(value)->Data(), -1, SQLITE_TRANSIENT);
        break;
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

  int Statement::BindInt(int index, int val) {
    return sqlite3_bind_int(statement, index, val);
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

  void Statement::Each(EachCallback^ callback, Windows::UI::Core::CoreDispatcher^ dispatcher) {
    auto callbackDelegate = ref new Windows::UI::Core::DispatchedHandler([=]() {
      callback(GetRow());
    });

    while (Step() == SQLITE_ROW) {
      auto callbackTask = concurrency::create_task(
        dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::Normal, callbackDelegate));
      callbackTask.get();
    }
  }

  int Statement::Step() {
    int ret = sqlite3_step(statement);

    if (ret != SQLITE_ROW && ret != SQLITE_DONE) {
      HRESULT hresult = MAKE_HRESULT(SEVERITY_ERROR, FACILITY_ITF, ret);
      throw ref new Platform::COMException(hresult);
    }

    return ret;
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

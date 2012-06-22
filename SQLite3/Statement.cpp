#include <ppltasks.h>
#include <Winerror.h>

#include "Statement.h"
#include "Database.h"

namespace SQLite3 {
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

  void Statement::Bind(Parameters^ params) {
    auto iter = params->First();
    int index = 1;
    do {
      auto param = iter->Current;
      int ret = SQLITE_ERROR;
      switch (Platform::Type::GetTypeCode(param->GetType())) {
      case Platform::TypeCode::Double:
        ret = sqlite3_bind_double(statement, index, static_cast<double>(param));
        break;
      case Platform::TypeCode::String:
        ret = sqlite3_bind_text16(statement, index, static_cast<Platform::String^>(param)->Data(), -1, SQLITE_TRANSIENT);
        break;
      }

      ++index;
    } while (iter->MoveNext());
  }

  void Statement::Run() {
    int ret = Step();

    if (ret != SQLITE_ROW && ret != SQLITE_DONE) {
      HRESULT hresult = MAKE_HRESULT(SEVERITY_ERROR, FACILITY_ITF, ret);
      throw ref new Platform::COMException(hresult);
    }
  }

  Row^ Statement::One() {
    int ret = Step();

    if (ret == SQLITE_ROW) {
      return GetRow();
    } else {
      HRESULT hresult = MAKE_HRESULT(SEVERITY_ERROR, FACILITY_ITF, ret);
      throw ref new Platform::COMException(hresult);
    }
  }

  Row^ Statement::GetRow() {
    Row^ row = ref new Row();

    int columnCount = ColumnCount();
    for (int i = 0 ; i < columnCount; ++i) {
      auto name = ColumnName(i);
      row->Insert(name, GetColumn(i));
    }

    return row;
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

  int Statement::Step() {
    return sqlite3_step(statement);
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

  int Statement::ColumnInt(int index) {
    return sqlite3_column_int(statement, index);
  }

  double Statement::ColumnDouble(int index) {
    return sqlite3_column_double(statement, index);
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
}

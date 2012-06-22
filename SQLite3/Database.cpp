#include <ppltasks.h>
#include <Winerror.h>

#include "Database.h"
#include "Statement.h"

namespace SQLite3 {
  IAsyncOperation<Database^>^ Database::OpenAsync(Platform::String^ dbPath) {
    return concurrency::create_async([=]() {
      sqlite3* sqlite;
      int ret = sqlite3_open16(dbPath->Data(), &sqlite);

      if (ret != SQLITE_OK) {
        sqlite3_close(sqlite);

        HRESULT hresult = MAKE_HRESULT(SEVERITY_ERROR, FACILITY_ITF, ret);
        throw ref new Platform::COMException(hresult);
      }

      return ref new Database(sqlite);
    });
  }

  Database::Database(sqlite3* sqlite)
    : sqlite(sqlite) {
  }

  Database::~Database() {
    sqlite3_close(sqlite);
  }

  IAsyncAction^ Database::RunAsync(Platform::String^ sql, Parameters^ params) {
    return concurrency::create_async([=]() {
      StatementPtr statement = PrepareAndBind(sql, params);
      statement->Run();
    });
  }

  IAsyncOperation<Row^>^ Database::OneAsync(Platform::String^ sql, Parameters^ params) {
    return concurrency::create_async([=]() {
      StatementPtr statement = PrepareAndBind(sql, params);
      return statement->One();
    });
  }

  IAsyncOperation<Rows^>^ Database::AllAsync(Platform::String^ sql, Parameters^ params) {
    return concurrency::create_async([=]() {
      StatementPtr statement = PrepareAndBind(sql, params);
      return statement->All();
    });
  }

  StatementPtr Database::PrepareAndBind(Platform::String^ sql, Parameters^ params) {
    StatementPtr statement = Statement::Prepare(sqlite, sql);

    if (params) {
      statement->Bind(params);
    }

    return statement;
  }
}

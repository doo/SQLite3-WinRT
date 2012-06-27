#include <collection.h>
#include <ppltasks.h>
#include <Winerror.h>

#include "Database.h"
#include "Statement.h"

namespace SQLite3 {
  static SafeParameterVector copyParameters(ParameterVector^ params) {
    SafeParameterVector paramsCopy;

    if (params) {
      std::copy(begin(params), end(params), std::back_inserter(paramsCopy));
    }

    return paramsCopy;
  }

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

  IAsyncAction^ Database::RunAsyncVector(Platform::String^ sql, ParameterVector^ params) {
    return RunAsync(sql, copyParameters(params));
  }

  IAsyncAction^ Database::RunAsyncMap(Platform::String^ sql, ParameterMap^ params) {
    return RunAsync(sql, params);
  }

  template <typename ParameterContainer>
  IAsyncAction^ Database::RunAsync(Platform::String^ sql, ParameterContainer params) {
    return concurrency::create_async([=]() {
      StatementPtr statement = PrepareAndBind(sql, params);
      statement->Run();
    });
  }

  IAsyncOperation<Row^>^ Database::OneAsync(Platform::String^ sql, ParameterVector^ params) {
    auto safeParams = copyParameters(params);

    return concurrency::create_async([=]() {
      StatementPtr statement = PrepareAndBind(sql, safeParams);
      return statement->One();
    });
  }

  IAsyncOperation<Rows^>^ Database::AllAsync(Platform::String^ sql, ParameterVector^ params) {
    auto safeParams = copyParameters(params);

    return concurrency::create_async([=]() {
      StatementPtr statement = PrepareAndBind(sql, safeParams);
      return statement->All();
    });
  }

  IAsyncAction^ Database::EachAsync(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback) {
    auto safeParams = copyParameters(params);

    auto window = Windows::UI::Core::CoreWindow::GetForCurrentThread();
    auto dispatcher = window->Dispatcher;

    return concurrency::create_async([=]() {
      StatementPtr statement = PrepareAndBind(sql, safeParams);
      return statement->Each(callback, dispatcher);
    });
  }

  template <typename ParameterContainer>
  StatementPtr Database::PrepareAndBind(Platform::String^ sql, ParameterContainer params) {
    StatementPtr statement = Statement::Prepare(sqlite, sql);
    statement->Bind(params);
    return statement;
  }
}

#include <collection.h>
#include <ppltasks.h>

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
    return concurrency::create_async([=]() -> Database^ {
      sqlite3* sqlite;
      
      int ret = sqlite3_open16(dbPath->Data(), &sqlite);

      if (ret != SQLITE_OK) {
        sqlite3_close(sqlite);
        throwSQLiteError(ret);
      }

      return ref new Database(sqlite);
    });
  }

  void Database::EnableSharedCache(bool enable) {
    int ret = sqlite3_enable_shared_cache(enable);
    if (ret != SQLITE_OK) {
      throwSQLiteError(ret);
    }
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

  IAsyncOperation<Row^>^ Database::OneAsyncVector(Platform::String^ sql, ParameterVector^ params) {
    return OneAsync(sql, copyParameters(params));
  }

  IAsyncOperation<Row^>^ Database::OneAsyncMap(Platform::String^ sql, ParameterMap^ params) {
    return OneAsync(sql, params);
  }

  template <typename ParameterContainer>
  IAsyncOperation<Row^>^ Database::OneAsync(Platform::String^ sql, ParameterContainer params) {
    return concurrency::create_async([=]() {
      StatementPtr statement = PrepareAndBind(sql, params);
      return statement->One();
    });
  }

  IAsyncOperation<Rows^>^ Database::AllAsyncVector(Platform::String^ sql, ParameterVector^ params) {
    return AllAsync(sql, copyParameters(params));
  }

  IAsyncOperation<Rows^>^ Database::AllAsyncMap(Platform::String^ sql, ParameterMap^ params) {
    return AllAsync(sql, params);
  }

  template <typename ParameterContainer>
  IAsyncOperation<Rows^>^ Database::AllAsync(Platform::String^ sql, ParameterContainer params) {
    return concurrency::create_async([=]() {
      StatementPtr statement = PrepareAndBind(sql, params);
      return statement->All();
    });
  }

  IAsyncAction^ Database::EachAsyncVector(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback) {
    return EachAsync(sql, copyParameters(params), callback);
  }

  IAsyncAction^ Database::EachAsyncMap(Platform::String^ sql, ParameterMap^ params, EachCallback^ callback) {
    return EachAsync(sql, params, callback);
  }

  template <typename ParameterContainer>
  IAsyncAction^ Database::EachAsync(Platform::String^ sql, ParameterContainer params, EachCallback^ callback) {
    auto window = Windows::UI::Core::CoreWindow::GetForCurrentThread();
    auto dispatcher = window->Dispatcher;

    return concurrency::create_async([=]() {
      StatementPtr statement = PrepareAndBind(sql, params);
      return statement->Each(callback, dispatcher);
    });
  }

  long long Database::GetLastInsertRowId() {
    return sqlite3_last_insert_rowid(sqlite);
  }
  
  template <typename ParameterContainer>
  StatementPtr Database::PrepareAndBind(Platform::String^ sql, ParameterContainer params) {
    StatementPtr statement = Statement::Prepare(sqlite, sql);
    statement->Bind(params);
    return statement;
  }
}

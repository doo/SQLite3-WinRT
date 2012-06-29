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

  Database^ Database::Open(Platform::String^ dbPath) {
    sqlite3* sqlite;
      
    int ret = sqlite3_open16(dbPath->Data(), &sqlite);

    if (ret != SQLITE_OK) {
      sqlite3_close(sqlite);
      throwSQLiteError(ret);
    }

    return ref new Database(sqlite);
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

  void Database::RunVector(Platform::String^ sql, ParameterVector^ params) {
    return Run(sql, copyParameters(params));
  }

  void Database::RunMap(Platform::String^ sql, ParameterMap^ params) {
    return Run(sql, params);
  }

  template <typename ParameterContainer>
  void Database::Run(Platform::String^ sql, ParameterContainer params) {
    try {
      StatementPtr statement = PrepareAndBind(sql, params);
      statement->Run();
    } catch (...) {
      lastErrorMsg = (WCHAR*)sqlite3_errmsg16(sqlite);
      throw;
    }
  }

  Row^ Database::OneVector(Platform::String^ sql, ParameterVector^ params) {
    return One(sql, copyParameters(params));
  }

  Row^ Database::OneMap(Platform::String^ sql, ParameterMap^ params) {
    return One(sql, params);
  }

  template <typename ParameterContainer>
  Row^ Database::One(Platform::String^ sql, ParameterContainer params) {
    try {
      StatementPtr statement = PrepareAndBind(sql, params);
      return statement->One();
    } catch (...) {
      lastErrorMsg = (WCHAR*)sqlite3_errmsg16(sqlite);
      throw;
    }
  }

  Rows^ Database::AllVector(Platform::String^ sql, ParameterVector^ params) {
    return All(sql, copyParameters(params));
  }

  Rows^ Database::AllMap(Platform::String^ sql, ParameterMap^ params) {
    return All(sql, params);
  }

  template <typename ParameterContainer>
  Rows^ Database::All(Platform::String^ sql, ParameterContainer params) {
    try {
      StatementPtr statement = PrepareAndBind(sql, params);
      return statement->All();
    } catch (...) {
      lastErrorMsg = (WCHAR*)sqlite3_errmsg16(sqlite);
      throw;
    }
  }

  void Database::EachVector(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback) {
    return Each(sql, copyParameters(params), callback);
  }

  void Database::EachMap(Platform::String^ sql, ParameterMap^ params, EachCallback^ callback) {
    return Each(sql, params, callback);
  }

  template <typename ParameterContainer>
  void Database::Each(Platform::String^ sql, ParameterContainer params, EachCallback^ callback) {
    auto window = Windows::UI::Core::CoreWindow::GetForCurrentThread();
    auto dispatcher = window->Dispatcher;

    try {
      StatementPtr statement = PrepareAndBind(sql, params);
      return statement->Each(callback, dispatcher);
    } catch (...) {
      lastErrorMsg = (WCHAR*)sqlite3_errmsg16(sqlite);
      throw;
    }
  }

  bool Database::GetAutocommit() {
    return sqlite3_get_autocommit(sqlite) != 0;
  }

  long long Database::GetLastInsertRowId() {
    return sqlite3_last_insert_rowid(sqlite);
  }
  
  Platform::String^ Database::GetLastError() {
    return ref new Platform::String(lastErrorMsg.c_str());
  }

  template <typename ParameterContainer>
  StatementPtr Database::PrepareAndBind(Platform::String^ sql, ParameterContainer params) {
    StatementPtr statement = Statement::Prepare(sqlite, sql);
    statement->Bind(params);
    return statement;
  }
}

#include <collection.h>
#include <ppltasks.h>

#include "Database.h"
#include "Statement.h"

using Windows::UI::Core::CoreDispatcher;
using Windows::UI::Core::CoreDispatcherPriority;
using Windows::UI::Core::CoreWindow;
using Windows::UI::Core::DispatchedHandler;

namespace SQLite3 {
  static SafeParameterVector CopyParameters(ParameterVector^ params) {
    SafeParameterVector paramsCopy;

    if (params) {
      std::copy(begin(params), end(params), std::back_inserter(paramsCopy));
    }

    return paramsCopy;
  }

  Database^ Database::Open(Platform::String^ dbPath) {
    CoreDispatcher^ dispatcher = CoreWindow::GetForCurrentThread()->Dispatcher;

    sqlite3* sqlite;
      
    int ret = sqlite3_open16(dbPath->Data(), &sqlite);

    if (ret != SQLITE_OK) {
      sqlite3_close(sqlite);
      throwSQLiteError(ret);
    }

      return ref new Database(sqlite, dispatcher);
  }

  void Database::EnableSharedCache(bool enable) {
    int ret = sqlite3_enable_shared_cache(enable);
    if (ret != SQLITE_OK) {
      throwSQLiteError(ret);
    }
  }

  Database::Database(sqlite3* sqlite, CoreDispatcher^ dispatcher)
    : sqlite(sqlite),
    dispatcher(dispatcher) {
    sqlite3_update_hook(sqlite, UpdateHook, reinterpret_cast<void*>(this));
  }

  Database::~Database() {
    sqlite3_close(sqlite);
  }
  
  void Database::RunVector(Platform::String^ sql, ParameterVector^ params) {
    return Run(sql, CopyParameters(params));
  }

  void Database::UpdateHook(void* data, int action, char const* dbName, char const* tableName, sqlite3_int64 rowId) {
    Database^ database = reinterpret_cast<Database^>(data);
    database->OnChange(action, dbName, tableName, rowId);
  }

  void Database::OnChange(int action, char const* dbName, char const* tableName, sqlite3_int64 rowId) {
    DispatchedHandler^ handler;
    ChangeEvent event;
    event.RowId = rowId;
    event.TableName = ToPlatformString(tableName);

    switch (action) {
    case SQLITE_INSERT:
      handler = ref new DispatchedHandler([this, event]() {
        Insert(this, event);
      });
      break;
    case SQLITE_UPDATE:
      handler = ref new DispatchedHandler([this, event]() {
        Update(this, event);
      });
      break;
    case SQLITE_DELETE:
      handler = ref new DispatchedHandler([this, event]() {
        Delete(this, event);
      });
      break;
    }
    if (handler) {
      dispatcher->RunAsync(CoreDispatcherPriority::Normal, handler);
    }
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
    return One(sql, CopyParameters(params));
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
    return All(sql, CopyParameters(params));
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
    return Each(sql, CopyParameters(params), callback);
  }

  void Database::EachMap(Platform::String^ sql, ParameterMap^ params, EachCallback^ callback) {
    return Each(sql, params, callback);
  }

  template <typename ParameterContainer>
  void Database::Each(Platform::String^ sql, ParameterContainer params, EachCallback^ callback) {
    try {
      StatementPtr statement = PrepareAndBind(sql, params);
      return statement->Each(callback);
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

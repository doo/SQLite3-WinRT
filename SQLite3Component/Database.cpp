#include <collection.h>

#include "Database.h"
#include "Statement.h"

using Windows::UI::Core::CoreDispatcher;
using Windows::UI::Core::CoreDispatcherPriority;
using Windows::UI::Core::CoreWindow;
using Windows::UI::Core::DispatchedHandler;

namespace SQLite3 {
  Database^ Database::Open(Platform::String^ dbPath) {
    sqlite3* sqlite;
    int ret = sqlite3_open16(dbPath->Data(), &sqlite);

    if (ret != SQLITE_OK) {
      sqlite3_close(sqlite);
      throwSQLiteError(ret);
    }

    CoreDispatcher^ dispatcher = CoreWindow::GetForCurrentThread()->Dispatcher;
    return ref new Database(sqlite, dispatcher);
  }

  void Database::EnableSharedCache(bool enable) {
    int ret = sqlite3_enable_shared_cache(enable);
    if (ret != SQLITE_OK) {
      throwSQLiteError(ret);
    }
  }

  Database::Database(sqlite3* sqlite, CoreDispatcher^ dispatcher)
    : sqlite(sqlite)
    , dispatcher(dispatcher) {
      sqlite3_update_hook(sqlite, UpdateHook, reinterpret_cast<void*>(this));
      sqlite3_create_function(sqlite, "ROWCOUNTER", 0, SQLITE_ANY, reinterpret_cast<void*>(this), &sqlite_row_counter, NULL, NULL);
  }

  Database::~Database() {
    sqlite3_close(sqlite);
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

  void Database::RunAsyncVector(Platform::String^ sql, ParameterVector^ params) {
    return RunAsync(sql, params);
  }

  void Database::RunAsyncMap(Platform::String^ sql, ParameterMap^ params) {
    return RunAsync(sql, params);
  }

  template <typename ParameterContainer>
  void Database::RunAsync(Platform::String^ sql, ParameterContainer params) {
    try {
      StatementPtr statement = PrepareAndBind(sql, params);
      statement->Run();
    } catch (Platform::Exception^ e) {
      lastErrorMsg = (WCHAR*)sqlite3_errmsg16(sqlite);
      throw;
    }
  }

  Platform::String^ Database::OneAsyncVector(Platform::String^ sql, ParameterVector^ params) {
    return OneAsync(sql, params);
  }

  Platform::String^ Database::OneAsyncMap(Platform::String^ sql, ParameterMap^ params) {
    return OneAsync(sql, params);
  }

  template <typename ParameterContainer>
  Platform::String^ Database::OneAsync(Platform::String^ sql, ParameterContainer params) {
    try {
      StatementPtr statement = PrepareAndBind(sql, params);
      return statement->One();
    } catch (Platform::Exception^ e) {
      lastErrorMsg = (WCHAR*)sqlite3_errmsg16(sqlite);
      throw;
    }
  }

  Platform::String^ Database::AllAsyncMap(Platform::String^ sql, ParameterMap^ params) {
    return AllAsync(sql, params);
  }

  Platform::String^ Database::AllAsyncVector(Platform::String^ sql, ParameterVector^ params) {
    return AllAsync(sql, params);
  }

  template <typename ParameterContainer>
  Platform::String^ Database::AllAsync(Platform::String^ sql, ParameterContainer params) {
    try {
      StatementPtr statement = PrepareAndBind(sql, params);
      return statement->All();
    } catch (Platform::Exception^ e) {
      lastErrorMsg = (WCHAR*)sqlite3_errmsg16(sqlite);
      throw;
    }
  }

  void Database::EachAsyncVector(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback) {
    return EachAsync(sql, params, callback);
  }

  void Database::EachAsyncMap(Platform::String^ sql, ParameterMap^ params, EachCallback^ callback) {
    return EachAsync(sql, params, callback);
  }

  template <typename ParameterContainer>
  void Database::EachAsync(Platform::String^ sql, ParameterContainer params, EachCallback^ callback) {
    try {
      StatementPtr statement = PrepareAndBind(sql, params);
      statement->Each(callback, dispatcher);
    } catch (Platform::Exception^ e) {
      lastErrorMsg = (WCHAR*)sqlite3_errmsg16(sqlite);
      throw;
    }
  }

  void sqlite_row_counter(sqlite3_context* context,int ,sqlite3_value**) {
    Database^ db = reinterpret_cast<Database^>(sqlite3_user_data(context));
    sqlite3_result_int64(context, ++db->statementRowCounter);
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
    statementRowCounter = 0;
    StatementPtr statement = Statement::Prepare(sqlite, sql);
    statement->Bind(params);
    return statement;
  }
}

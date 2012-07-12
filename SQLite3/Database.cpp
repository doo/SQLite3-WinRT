#include <collection.h>
#include <ppltasks.h>
#include <Winerror.h>

#include "Database.h"
#include "Statement.h"

using Windows::UI::Core::CoreDispatcher;
using Windows::UI::Core::CoreDispatcherPriority;
using Windows::UI::Core::CoreWindow;
using Windows::UI::Core::DispatchedHandler;

namespace SQLite3 {
  static SafeParameterVector copyParameters(ParameterVector^ params) {
    SafeParameterVector paramsCopy;

    if (params) {
      std::copy(begin(params), end(params), std::back_inserter(paramsCopy));
    }

    return paramsCopy;
  }

  IAsyncOperation<Database^>^ Database::OpenAsync(Platform::String^ dbPath) {
    CoreDispatcher^ dispatcher = CoreWindow::GetForCurrentThread()->Dispatcher;

    return concurrency::create_async([=]() {
      sqlite3* sqlite;
      int ret = sqlite3_open16(dbPath->Data(), &sqlite);

      if (ret != SQLITE_OK) {
        sqlite3_close(sqlite);

        HRESULT hresult = MAKE_HRESULT(SEVERITY_ERROR, FACILITY_ITF, ret);
        throw ref new Platform::COMException(hresult);
      }

      return ref new Database(sqlite, dispatcher);
    });
  }

  Database::Database(sqlite3* sqlite, CoreDispatcher^ dispatcher)
    : sqlite(sqlite),
    dispatcher(dispatcher) {
    sqlite3_update_hook(sqlite, updateHook, reinterpret_cast<void*>(this));
  }

  Database::~Database() {
    sqlite3_close(sqlite);
  }

  void Database::updateHook(void* data, int what, char const* dbName, char const* tableName, sqlite3_int64 rowid) {
    Database^ database = reinterpret_cast<Database^>(data);
    database->OnChange(what, dbName, tableName, rowid);
  }

  void Database::OnChange(int what, char const* dbName, char const* tableName, sqlite3_int64 rowid) {
    DispatchedHandler^ handler;
    ChangeEvent event;
    event.Rowid = rowid;
    event.TableName = toPlatformString(tableName);

    switch (what) {
    case SQLITE_INSERT:
      handler = ref new DispatchedHandler([this, event]() {
        inserted(this, event);
      });
      break;
    case SQLITE_UPDATE:
      handler = ref new DispatchedHandler([this, event]() {
        updated(this, event);
      });
      break;
    case SQLITE_DELETE:
      handler = ref new DispatchedHandler([this, event]() {
        deleted(this, event);
      });
      break;
    }
    if (handler) {
      dispatcher->RunAsync(CoreDispatcherPriority::Normal, handler);
    }
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

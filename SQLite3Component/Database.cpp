#include <ppl.h>
#include <ppltasks.h>

#include <collection.h>
#include <map>

#include "Database.h"
#include "Statement.h"

using Windows::UI::Core::CoreDispatcher;
using Windows::UI::Core::CoreDispatcherPriority;
using Windows::UI::Core::CoreWindow;
using Windows::UI::Core::DispatchedHandler;

using Windows::Foundation::IAsyncAction;
using Windows::Foundation::IAsyncOperation;

namespace SQLite3 {
  static int WinLocaleCollateUtf16(void *data, int str1Length, const void* str1Data, int str2Length, const void* str2Data) {
    Database^ db = reinterpret_cast<Database^>(data);
    Platform::String^ language = db->CollationLanguage;
    int compareResult = CompareStringEx(language ? language->Data() : LOCALE_NAME_USER_DEFAULT, 
                                        LINGUISTIC_IGNORECASE|LINGUISTIC_IGNOREDIACRITIC|SORT_DIGITSASNUMBERS, 
                                        (LPCWCH)str1Data, str1Length/2, 
                                        (LPCWCH)str2Data, str2Length/2, 
                                        NULL, NULL, 0);
    if (compareResult == 0) {
      throw ref new Platform::InvalidArgumentException();
    }
    return compareResult-2;
  }

  static int WinLocaleCollateUtf8(void* data, int str1Length, const void* str1Data, int str2Length, const void* str2Data) {
    std::wstring string1 = ToWString((const char*)str1Data, str1Length);
    std::wstring string2 = ToWString((const char*)str2Data, str2Length);
    return WinLocaleCollateUtf16(data, string1.length()*2, string1.c_str(), string2.length()*2, string2.c_str());
  }

  static SafeParameterVector CopyParameters(ParameterVector^ params) {
    SafeParameterVector paramsCopy;

    if (params) {
      std::copy(begin(params), end(params), std::back_inserter(paramsCopy));
    }

    return paramsCopy;
  }

  static std::map<Platform::String^, Windows::ApplicationModel::Resources::ResourceLoader^> resourceLoaders;
  static void TranslateUtf16(sqlite3_context *context, int argc, sqlite3_value **argv) {
    int param0Type = sqlite3_value_type(argv[0]);
    int param1Type = argc == 2 ? sqlite3_value_type(argv[1]) : -1;
    if (param0Type != SQLITE_TEXT || (argc == 2 && param1Type != SQLITE_TEXT)) {
      sqlite3_result_error(context, "Invalid parameters", -1);
      return;
    }
    Windows::ApplicationModel::Resources::ResourceLoader^ resourceLoader;
    const wchar_t* key;
    if (argc == 1) {
      static auto defaultResourceLoader = ref new Windows::ApplicationModel::Resources::ResourceLoader();
      resourceLoader = defaultResourceLoader;

      key = (wchar_t*)sqlite3_value_text16(argv[0]);
    } else {
      auto resourceMapName = ref new Platform::String((wchar_t*)sqlite3_value_text16(argv[0]));
      resourceLoader = resourceLoaders[resourceMapName];
      if (!resourceLoader) {
        resourceLoader = ref new Windows::ApplicationModel::Resources::ResourceLoader(resourceMapName);
        resourceLoaders[resourceMapName] = resourceLoader;
      }

      key = (wchar_t*)sqlite3_value_text16(argv[1]);
    }
    
    auto platformKey = ref new Platform::String(key);
    auto translation = resourceLoader->GetString(platformKey);
    sqlite3_result_text16(context, translation->Data(), (translation->Length()+1)*sizeof(wchar_t), SQLITE_TRANSIENT);
  }

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
    : collationLanguage(nullptr) // will use user locale
    , dispatcher(dispatcher)
    , sqlite(sqlite) {
      sqlite3_update_hook(sqlite, UpdateHook, reinterpret_cast<void*>(this));

      sqlite3_create_collation_v2(sqlite, "WINLOCALE", SQLITE_UTF16, reinterpret_cast<void*>(this), WinLocaleCollateUtf16, nullptr);
      sqlite3_create_collation_v2(sqlite, "WINLOCALE", SQLITE_UTF8, reinterpret_cast<void*>(this), WinLocaleCollateUtf8, nullptr);

      sqlite3_create_function_v2(sqlite, "APPTRANSLATE", 1, SQLITE_UTF16, NULL, TranslateUtf16, nullptr, nullptr, nullptr);
      sqlite3_create_function_v2(sqlite, "APPTRANSLATE", 2, SQLITE_UTF16, NULL, TranslateUtf16, nullptr, nullptr, nullptr);
  }

  Database::~Database() {
    sqlite3_close(sqlite);
  }

  void Database::UpdateHook(void* data, int action, char const* dbName, char const* tableName, sqlite3_int64 rowId) {
    Database^ database = reinterpret_cast<Database^>(data);
    database->OnChange(action, dbName, tableName, rowId);
  }

  IAsyncAction^ Database::VacuumAsync() {
    return Concurrency::create_async([this]() {
      bool oldFireEvents = fireEvents;
      fireEvents = false;
      Concurrency::task<void>(RunAsync("VACUUM", reinterpret_cast<ParameterMap^>(nullptr))).get();
      fireEvents = oldFireEvents;
    });
  }

  void Database::OnChange(int action, char const* dbName, char const* tableName, sqlite3_int64 rowId) {
    // See http://social.msdn.microsoft.com/Forums/en-US/winappswithcsharp/thread/d778c6e0-c248-4a1a-9391-28d038247578
    // Too many dispatched events fill the Windows Message queue and this will raise an QUOTA_EXCEEDED error
    if (fireEvents) {
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
  }

  IAsyncAction^ Database::RunAsyncVector(Platform::String^ sql, ParameterVector^ params) {
    return RunAsync(sql, CopyParameters(params));
  }

  IAsyncAction^ Database::RunAsyncMap(Platform::String^ sql, ParameterMap^ params) {
    return RunAsync(sql, params);
  }

  template <typename ParameterContainer>
  IAsyncAction^ Database::RunAsync(Platform::String^ sql, ParameterContainer params) {
    return Concurrency::create_async([this, sql, params] {
      try {
        StatementPtr statement = PrepareAndBind(sql, params);
        statement->Run();
      } catch (Platform::Exception^ e) {
        lastErrorMsg = (WCHAR*)sqlite3_errmsg16(sqlite);
        throw;
      }
    });
  }

  IAsyncOperation<Platform::String^>^ Database::OneAsyncVector(Platform::String^ sql, ParameterVector^ params) {
    return OneAsync(sql, CopyParameters(params));
  }

  IAsyncOperation<Platform::String^>^ Database::OneAsyncMap(Platform::String^ sql, ParameterMap^ params) {
    return OneAsync(sql, params);
  }

  template <typename ParameterContainer>
  IAsyncOperation<Platform::String^>^ Database::OneAsync(Platform::String^ sql, ParameterContainer params) {
    return Concurrency::create_async([this, sql, params]() {
      try {
        StatementPtr statement = PrepareAndBind(sql, params);
        return statement->One();
      } catch (Platform::Exception^ e) {
        lastErrorMsg = (WCHAR*)sqlite3_errmsg16(sqlite);
        throw;
      }
    });
  }

  IAsyncOperation<Platform::String^>^ Database::AllAsyncMap(Platform::String^ sql, ParameterMap^ params) {
    return AllAsync(sql, params);
  }

  IAsyncOperation<Platform::String^>^ Database::AllAsyncVector(Platform::String^ sql, ParameterVector^ params) {
    return AllAsync(sql, CopyParameters(params));
  }

  template <typename ParameterContainer>
  IAsyncOperation<Platform::String^>^ Database::AllAsync(Platform::String^ sql, ParameterContainer params) {
    return Concurrency::create_async([this, sql, params]() {
      try {
        StatementPtr statement = PrepareAndBind(sql, params);
        return statement->All();
      } catch (Platform::Exception^ e) {
        lastErrorMsg = (WCHAR*)sqlite3_errmsg16(sqlite);
        throw;
      }
    });
  }

  IAsyncAction^ Database::EachAsyncVector(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback) {
    return EachAsync(sql, CopyParameters(params), callback);
  }

  IAsyncAction^ Database::EachAsyncMap(Platform::String^ sql, ParameterMap^ params, EachCallback^ callback) {
    return EachAsync(sql, params, callback);
  }

  template <typename ParameterContainer>
  IAsyncAction^ Database::EachAsync(Platform::String^ sql, ParameterContainer params, EachCallback^ callback) {
    return Concurrency::create_async([this, sql, params, callback] {
      try {
        StatementPtr statement = PrepareAndBind(sql, params);
        statement->Each(callback, dispatcher);
      } catch (Platform::Exception^ e) {
        lastErrorMsg = (WCHAR*)sqlite3_errmsg16(sqlite);
        throw;
      }
    });
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

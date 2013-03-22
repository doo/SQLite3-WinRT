#include <ppl.h>
#include <ppltasks.h>

#include <collection.h>
#include <map>
#include <regex>
#include <assert.h>

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
                                        (LPCWCH)str1Data, str1Length/sizeof(wchar_t), 
                                        (LPCWCH)str2Data, str2Length/sizeof(wchar_t), 
                                        NULL, NULL, 0);
    if (compareResult == 0) {
      throw ref new Platform::InvalidArgumentException();
    }
    return compareResult-2;
  }

  static int WinLocaleCollateUtf8(void* data, int str1Length, const void* str1Data, int str2Length, const void* str2Data) {
    std::wstring string1 = ToWString((const char*)str1Data, str1Length);
    std::wstring string2 = ToWString((const char*)str2Data, str2Length);
    // SQLite expects unsigned int argument but length returns size_t (unsigned machine word). I think its safe to cast this warning away here
    // since "no one ever needs strings bigger than 2 GB in size". If they do, they have to fix the signature and internals of SQLite themself.
    return WinLocaleCollateUtf16(data, (int)(string1.length()*sizeof(wchar_t)), string1.c_str(), (int)(string2.length()*sizeof(wchar_t)), string2.c_str());
  }

  static void SqliteRegexUtf16( sqlite3_context *context, int argc, sqlite3_value **argv ) {
    const wchar_t* patternText = (const wchar_t*) sqlite3_value_text16(argv[0]);
    std::wstring searchText((const wchar_t*) sqlite3_value_text16(argv[1]));
    std::wregex regex(patternText);
    sqlite3_result_int(context, std::regex_search(searchText.begin(), searchText.end(), regex) ? 1 : 0);
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

  bool Database::sharedCache = false;

  IAsyncOperation<Database^>^ Database::OpenAsync(Platform::String^ dbPath) {
    if (!dbPath->Length()) {
      throw ref new Platform::COMException(E_INVALIDARG, L"You must specify a path or :memory:");
    }

    // Need to remember the current thread for later callbacks into JS
    CoreDispatcher^ dispatcher = CoreWindow::GetForCurrentThread()->Dispatcher;
    
    return Concurrency::create_async([dbPath, dispatcher]() {
      sqlite3* sqlite;
      int ret = sqlite3_open16(dbPath->Data(), &sqlite);

      if (ret != SQLITE_OK) {
        sqlite3_close(sqlite);
        throwSQLiteError(ret, dbPath);
      }

      return ref new Database(sqlite, dispatcher);
    });    
  }

  Database::Database(sqlite3* sqlite, CoreDispatcher^ dispatcher)
    : collationLanguage(nullptr) // will use user locale
    , dispatcher(dispatcher)
    , fireEvents(true)
    , changeHandlers(0)
    , insertChangeHandlers(0)
    , updateChangeHandlers(0)
    , deleteChangeHandlers(0)
    , sqlite(sqlite) {
      assert(sqlite);
      sqlite3_create_collation_v2(sqlite, "WINLOCALE", SQLITE_UTF16, reinterpret_cast<void*>(this), WinLocaleCollateUtf16, nullptr);
      sqlite3_create_collation_v2(sqlite, "WINLOCALE", SQLITE_UTF8, reinterpret_cast<void*>(this), WinLocaleCollateUtf8, nullptr);

      sqlite3_create_function_v2(sqlite, "APPTRANSLATE", 1, SQLITE_UTF16, NULL, TranslateUtf16, nullptr, nullptr, nullptr);
      sqlite3_create_function_v2(sqlite, "APPTRANSLATE", 2, SQLITE_UTF16, NULL, TranslateUtf16, nullptr, nullptr, nullptr);

      sqlite3_create_function_v2(sqlite, "REGEXP", 2, SQLITE_UTF16, NULL, SqliteRegexUtf16, nullptr, nullptr, nullptr);
  }

  Database::~Database() {
    sqlite3_close(sqlite);
  }

  void Database::addChangeHandler(int& handlerCount) {
    assert(changeHandlers >= 0);
    assert(handlerCount >= 0);
    ++handlerCount;
    if (changeHandlers++ == 0) {
      sqlite3_update_hook(sqlite, UpdateHook, reinterpret_cast<void*>(this));
    }
  }

  void Database::removeChangeHandler(int& handlerCount) {
    assert(changeHandlers > 0);
    assert(handlerCount > 0);
    --handlerCount;
    if (--changeHandlers == 0) {
      sqlite3_update_hook(sqlite, nullptr, nullptr);
    }
  }

  void Database::UpdateHook(void* data, int action, char const* dbName, char const* tableName, sqlite3_int64 rowId) {
    assert(data);
    Database^ database = reinterpret_cast<Database^>(data);
    database->OnChange(action, dbName, tableName, rowId);
  }

  IAsyncAction^ Database::VacuumAsync() {
    return Concurrency::create_async([this]() {
      bool oldFireEvents = fireEvents;
      fireEvents = false;
      // See http://social.msdn.microsoft.com/Forums/en-US/winappswithcsharp/thread/d778c6e0-c248-4a1a-9391-28d038247578
      // Too many dispatched events fill the Windows Message queue and this will raise an QUOTA_EXCEEDED error
      Concurrency::task<int>(RunAsync("VACUUM", reinterpret_cast<ParameterMap^>(nullptr))).get();
      fireEvents = oldFireEvents;
    });
  }

  void Database::OnChange(int action, char const* dbName, char const* tableName, sqlite3_int64 rowId) {
    if (fireEvents) {
      DispatchedHandler^ handler;
      
      switch (action) {
      case SQLITE_INSERT:
        if (insertChangeHandlers) {
          ChangeEvent event;
          event.RowId = rowId;
          event.TableName = ToPlatformString(tableName);        
          handler = ref new DispatchedHandler([this, event]() {
            _Insert(this, event);
          });
        }
        break;
      case SQLITE_UPDATE:
        if (updateChangeHandlers) {
          ChangeEvent event;
          event.RowId = rowId;
          event.TableName = ToPlatformString(tableName);        
          handler = ref new DispatchedHandler([this, event]() {
            _Update(this, event);
          });
        }
        break;
      case SQLITE_DELETE:
        if (deleteChangeHandlers) {
          ChangeEvent event;
          event.RowId = rowId;
          event.TableName = ToPlatformString(tableName);        
          handler = ref new DispatchedHandler([this, event]() {
            _Delete(this, event);
          });
        }
        break;
      }
      if (handler) {
        dispatcher->RunAsync(CoreDispatcherPriority::Normal, handler);
      }
    }
  }

  IAsyncOperation<int>^ Database::RunAsyncVector(Platform::String^ sql, ParameterVector^ params) {
    return RunAsync(sql, CopyParameters(params));
  }

  IAsyncOperation<int>^ Database::RunAsyncMap(Platform::String^ sql, ParameterMap^ params) {
    return RunAsync(sql, params);
  }

  template <typename ParameterContainer>
  IAsyncOperation<int>^ Database::RunAsync(Platform::String^ sql, ParameterContainer params) {
    return Concurrency::create_async([this, sql, params] {
      try {
        StatementPtr statement = PrepareAndBind(sql, params);
        statement->Run();
        return sqlite3_changes(sqlite);
      } catch (Platform::Exception^ e) {
        saveLastErrorMessage();
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
        saveLastErrorMessage();
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
        saveLastErrorMessage();
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
        saveLastErrorMessage();
        throw;
      }
    });
  }

  template <typename ParameterContainer>
  StatementPtr Database::PrepareAndBind(Platform::String^ sql, ParameterContainer params) {
    StatementPtr statement = Statement::Prepare(sqlite, sql);
    statement->Bind(params);
    return statement;
  }

  void Database::saveLastErrorMessage() {
    if (sqlite3_errcode(sqlite) != SQLITE_OK) {
      lastErrorMessage = (WCHAR*)sqlite3_errmsg16(sqlite);
    } else {
      lastErrorMessage.clear();
    }        
  }
}

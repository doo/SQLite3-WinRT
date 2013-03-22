#pragma once

#include "sqlite3.h"
#include "Common.h"

namespace SQLite3 {
  public value struct ChangeEvent {
    Platform::String^ TableName;
    int64 RowId;
  };
  
  public delegate void ChangeHandler(Platform::Object^ source, ChangeEvent event);
  
  public ref class Database sealed {
  public:
    static IAsyncOperation<Database^>^ OpenAsync(Platform::String^ dbPath);

    static property bool SharedCache {
      bool get() {
        return sharedCache;
      };

      void set(bool value) {
        int ret = sqlite3_enable_shared_cache(value);
        if (ret != SQLITE_OK) {
          throwSQLiteError(ret, ref new Platform::String(L"Could not set shared cache"));
        }
      };
    }
    
    virtual ~Database();

    Windows::Foundation::IAsyncOperation<int>^ RunAsyncVector(Platform::String^ sql, ParameterVector^ params);
    Windows::Foundation::IAsyncOperation<int>^ RunAsyncMap(Platform::String^ sql, ParameterMap^ params);
    Windows::Foundation::IAsyncOperation<Platform::String^>^ OneAsyncVector(Platform::String^ sql, ParameterVector^ params);
    Windows::Foundation::IAsyncOperation<Platform::String^>^ OneAsyncMap(Platform::String^ sql, ParameterMap^ params);
    Windows::Foundation::IAsyncOperation<Platform::String^>^ AllAsyncVector(Platform::String^ sql, ParameterVector^ params);
    Windows::Foundation::IAsyncOperation<Platform::String^>^ AllAsyncMap(Platform::String^ sql, ParameterMap^ params);
    Windows::Foundation::IAsyncAction^ EachAsyncVector(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback);
    Windows::Foundation::IAsyncAction^ EachAsyncMap(Platform::String^ sql, ParameterMap^ params, EachCallback^ callback);

    Windows::Foundation::IAsyncAction^ VacuumAsync();
    
    property Platform::String^ LastError {
      Platform::String^ get() {
        return ref new Platform::String(lastErrorMessage.c_str());
      };
    }

    property long long LastInsertRowId {
      long long get() {
        return sqlite3_last_insert_rowid(sqlite);
      };
    }

    property bool AutoCommit {
      bool get() {
        return sqlite3_get_autocommit(sqlite) != 0;
      };
    }

    event ChangeHandler^ Insert {
      Windows::Foundation::EventRegistrationToken add(ChangeHandler^ handler) {
        addChangeHandler(insertChangeHandlers);
        return _Insert += handler;
      }

      void remove(Windows::Foundation::EventRegistrationToken token) {
        _Insert -= token;
        removeChangeHandler(insertChangeHandlers);
      }
    }

    event ChangeHandler^ Update {
      Windows::Foundation::EventRegistrationToken add(ChangeHandler^ handler) {
        addChangeHandler(updateChangeHandlers);
        return _Update += handler;
      }

      void remove(Windows::Foundation::EventRegistrationToken token) {
        _Update -= token;
        removeChangeHandler(updateChangeHandlers);
      }
    }

    event ChangeHandler^ Delete {
      Windows::Foundation::EventRegistrationToken add(ChangeHandler^ handler) {
        addChangeHandler(deleteChangeHandlers);
        return _Delete += handler;
      }

      void remove(Windows::Foundation::EventRegistrationToken token) {
        _Delete -= token;
        removeChangeHandler(deleteChangeHandlers);
      }
    }

    property Platform::String^ CollationLanguage {
      Platform::String^ get() {
        return collationLanguage;
      }
      void set(Platform::String^ value) {
        collationLanguage = value;
      }
    }

    property bool FireEvents {
      bool get() {
        return fireEvents;
      };
      void set(bool value) {
        fireEvents = value;
      };
    }

  private:
    static bool sharedCache;
    Database(sqlite3* sqlite, Windows::UI::Core::CoreDispatcher^ dispatcher);

    template <typename ParameterContainer>
    StatementPtr PrepareAndBind(Platform::String^ sql, ParameterContainer params);

    template <typename ParameterContainer>
    Windows::Foundation::IAsyncOperation<int>^ RunAsync(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Windows::Foundation::IAsyncOperation<Platform::String^>^ OneAsync(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Windows::Foundation::IAsyncOperation<Platform::String^>^ AllAsync(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Windows::Foundation::IAsyncAction^ EachAsync(Platform::String^ sql, ParameterContainer params, EachCallback^ callback);

    static void __cdecl UpdateHook(void* data, int action, char const* dbName, char const* tableName, sqlite3_int64 rowId);
    void OnChange(int action, char const* dbName, char const* tableName, sqlite3_int64 rowId);

    bool fireEvents;
    Platform::String^ collationLanguage;
    Windows::UI::Core::CoreDispatcher^ dispatcher;
    sqlite3* sqlite;
    std::wstring lastErrorMessage;

    void saveLastErrorMessage();

    event ChangeHandler^ _Insert;
    int insertChangeHandlers;
    event ChangeHandler^ _Update;
    int updateChangeHandlers;
    event ChangeHandler^ _Delete;
    int deleteChangeHandlers;

    int changeHandlers;
    void addChangeHandler(int& handlerCount);
    void removeChangeHandler(int& handlerCount);
  };
}

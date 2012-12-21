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
    static Database^ Open(Platform::String^ dbPath);
    static void EnableSharedCache(bool enable);

    Database() : fireEvents(false), sqlite(nullptr) {}

    virtual ~Database();

    Windows::Foundation::IAsyncAction^ RunAsyncVector(Platform::String^ sql, ParameterVector^ params);
    Windows::Foundation::IAsyncAction^ RunAsyncMap(Platform::String^ sql, ParameterMap^ params);
    Windows::Foundation::IAsyncOperation<Platform::String^>^ OneAsyncVector(Platform::String^ sql, ParameterVector^ params);
    Windows::Foundation::IAsyncOperation<Platform::String^>^ OneAsyncMap(Platform::String^ sql, ParameterMap^ params);
    Windows::Foundation::IAsyncOperation<Platform::String^>^ AllAsyncVector(Platform::String^ sql, ParameterVector^ params);
    Windows::Foundation::IAsyncOperation<Platform::String^>^ AllAsyncMap(Platform::String^ sql, ParameterMap^ params);
    Windows::Foundation::IAsyncAction^ EachAsyncVector(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback);
    Windows::Foundation::IAsyncAction^ EachAsyncMap(Platform::String^ sql, ParameterMap^ params, EachCallback^ callback);

    Windows::Foundation::IAsyncAction^ VacuumAsync();

    bool GetAutocommit();
    long long GetLastInsertRowId();
    Platform::String^ GetLastError();

    event ChangeHandler^ Insert;
    event ChangeHandler^ Update;
    event ChangeHandler^ Delete;

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
    Database(sqlite3* sqlite, Windows::UI::Core::CoreDispatcher^ dispatcher);

    template <typename ParameterContainer>
    StatementPtr PrepareAndBind(Platform::String^ sql, ParameterContainer params);

    template <typename ParameterContainer>
    Windows::Foundation::IAsyncAction^ RunAsync(Platform::String^ sql, ParameterContainer params);
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
    std::wstring lastErrorMsg;
  };
}

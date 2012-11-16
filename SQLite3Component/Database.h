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

    virtual ~Database();

    void RunAsyncVector(Platform::String^ sql, ParameterVector^ params);
    void RunAsyncMap(Platform::String^ sql, ParameterMap^ params);
    Platform::String^ OneAsyncVector(Platform::String^ sql, ParameterVector^ params);
    Platform::String^ OneAsyncMap(Platform::String^ sql, ParameterMap^ params);
    Platform::String^ AllAsyncVector(Platform::String^ sql, ParameterVector^ params);
    Platform::String^ AllAsyncMap(Platform::String^ sql, ParameterMap^ params);
    void EachAsyncVector(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback);
    void EachAsyncMap(Platform::String^ sql, ParameterMap^ params, EachCallback^ callback);

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

  private:
    Database(sqlite3* sqlite, Windows::UI::Core::CoreDispatcher^ dispatcher);

    template <typename ParameterContainer>
    StatementPtr PrepareAndBind(Platform::String^ sql, ParameterContainer params);

    template <typename ParameterContainer>
    void RunAsync(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Platform::String^ OneAsync(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Platform::String^ AllAsync(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    void EachAsync(Platform::String^ sql, ParameterContainer params, EachCallback^ callback);

    static void __cdecl UpdateHook(void* data, int action, char const* dbName, char const* tableName, sqlite3_int64 rowId);
    void OnChange(int action, char const* dbName, char const* tableName, sqlite3_int64 rowId);

    Platform::String^ collationLanguage;
    Windows::UI::Core::CoreDispatcher^ dispatcher;
    sqlite3* sqlite;
    std::wstring lastErrorMsg;
  };
}

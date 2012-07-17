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

    ~Database();

    void RunVector(Platform::String^ sql, ParameterVector^ params);
    void RunMap(Platform::String^ sql, ParameterMap^ params);
    Platform::String^ OneVector(Platform::String^ sql, ParameterVector^ params);
    Platform::String^ OneMap(Platform::String^ sql, ParameterMap^ params);
    Platform::String^ AllMap(Platform::String^ sql, ParameterMap^ params);
    Platform::String^ AllVector(Platform::String^ sql, ParameterVector^ params);
    void EachVector(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback);
    void EachMap(Platform::String^ sql, ParameterMap^ params, EachCallback^ callback);

    bool GetAutocommit();
    long long GetLastInsertRowId();
    Platform::String^ GetLastError();

    event ChangeHandler^ Insert;
    event ChangeHandler^ Update;
    event ChangeHandler^ Delete;

  private:
    Database(sqlite3* sqlite);

    template <typename ParameterContainer>
    StatementPtr PrepareAndBind(Platform::String^ sql, ParameterContainer params);

    template <typename ParameterContainer>
    void Run(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Platform::String^ One(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Platform::String^ All(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    void Each(Platform::String^ sql, ParameterContainer params, EachCallback^ callback);

    static void __cdecl UpdateHook(void* data, int action, char const* dbName, char const* tableName, sqlite3_int64 rowId);
    void OnChange(int action, char const* dbName, char const* tableName, sqlite3_int64 rowId);

    Windows::UI::Core::CoreDispatcher^ dispatcher;
    sqlite3* sqlite;
    std::wstring lastErrorMsg;
  };
}

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
    Row^ OneVector(Platform::String^ sql, ParameterVector^ params);
    Row^ OneMap(Platform::String^ sql, ParameterMap^ params);
    Rows^ AllVector(Platform::String^ sql, ParameterVector^ params);
    Rows^ AllMap(Platform::String^ sql, ParameterMap^ params);
    Windows::Foundation::Collections::IVectorView<Platform::String^>^ AllJSONMap(Platform::String^ sql, ParameterMap^ params);
    Windows::Foundation::Collections::IVectorView<Platform::String^>^ AllJSONVector(Platform::String^ sql, ParameterVector^ params);
    Platform::String^ AllJSONStringMap(Platform::String^ sql, ParameterMap^ params);
    Platform::String^ AllJSONStringVector(Platform::String^ sql, ParameterVector^ params);
    void EachVector(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback);
    void EachMap(Platform::String^ sql, ParameterMap^ params, EachCallback^ callback);

    bool GetAutocommit();
    long long GetLastInsertRowId();
    Platform::String^ GetLastError();

    event ChangeHandler^ Insert;
    event ChangeHandler^ Update;
    event ChangeHandler^ Delete;

  private:
    Database(sqlite3* sqlite, Windows::UI::Core::CoreDispatcher^);

    template <typename ParameterContainer>
    StatementPtr PrepareAndBind(Platform::String^ sql, ParameterContainer params);

    template <typename ParameterContainer>
    void Run(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Row^ One(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Rows^ All(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Windows::Foundation::Collections::IVectorView<Platform::String^>^ AllJSON(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Platform::String^ AllJSONString(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    void Each(Platform::String^ sql, ParameterContainer params, EachCallback^ callback);

    static void __cdecl UpdateHook(void* data, int action, char const* dbName, char const* tableName, sqlite3_int64 rowId);
    void OnChange(int action, char const* dbName, char const* tableName, sqlite3_int64 rowId);

    Windows::UI::Core::CoreDispatcher^ dispatcher;
    sqlite3* sqlite;
    std::wstring lastErrorMsg;
  };
}

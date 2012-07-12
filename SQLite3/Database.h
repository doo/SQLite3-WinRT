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
    ~Database();

    IAsyncAction^ RunAsyncVector(Platform::String^ sql, ParameterVector^ params);
    IAsyncAction^ RunAsyncMap(Platform::String^ sql, ParameterMap^ params);
    IAsyncOperation<Row^>^ OneAsyncVector(Platform::String^ sql, ParameterVector^ params);
    IAsyncOperation<Row^>^ OneAsyncMap(Platform::String^ sql, ParameterMap^ params);
    IAsyncOperation<Rows^>^ AllAsyncVector(Platform::String^ sql, ParameterVector^ params);
    IAsyncOperation<Rows^>^ AllAsyncMap(Platform::String^ sql, ParameterMap^ params);
    IAsyncAction^ EachAsyncVector(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback);
    IAsyncAction^ EachAsyncMap(Platform::String^ sql, ParameterMap^ params, EachCallback^ callback);

    long long GetLastInsertRowId();

    event ChangeHandler^ inserted;
    event ChangeHandler^ updated;
    event ChangeHandler^ deleted;

  private:
    Database(sqlite3* sqlite, Windows::UI::Core::CoreDispatcher^);

    template <typename ParameterContainer>
    StatementPtr PrepareAndBind(Platform::String^ sql, ParameterContainer params);

    template <typename ParameterContainer>
    IAsyncAction^ RunAsync(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    IAsyncOperation<Row^>^ OneAsync(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    IAsyncOperation<Rows^>^ AllAsync(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    IAsyncAction^ EachAsync(Platform::String^ sql, ParameterContainer params, EachCallback^ callback);

    static void __cdecl UpdateHook(void* data, int what, char const* dbName, char const* tableName, sqlite3_int64 rowId);
    void OnChange(int what, char const* dbName, char const* tableName, sqlite3_int64 rowId);

    Windows::UI::Core::CoreDispatcher^ dispatcher;
    sqlite3* sqlite;
  };
}

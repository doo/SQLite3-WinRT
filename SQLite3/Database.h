#pragma once

#include "sqlite3.h"
#include "Common.h"

namespace SQLite3 {
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

  private:
    Database(sqlite3* sqlite);

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

    sqlite3* sqlite;
  };
}

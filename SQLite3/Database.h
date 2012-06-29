#pragma once

#include "sqlite3.h"
#include "Common.h"

namespace SQLite3 {
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
    void EachVector(Platform::String^ sql, ParameterVector^ params, EachCallback^ callback);
    void EachMap(Platform::String^ sql, ParameterMap^ params, EachCallback^ callback);

    bool GetAutocommit();
    long long GetLastInsertRowId();
    Platform::String^ GetLastError();

  private:
    Database(sqlite3* sqlite);

    template <typename ParameterContainer>
    StatementPtr PrepareAndBind(Platform::String^ sql, ParameterContainer params);

    template <typename ParameterContainer>
    void Run(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Row^ One(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    Rows^ All(Platform::String^ sql, ParameterContainer params);
    template <typename ParameterContainer>
    void Each(Platform::String^ sql, ParameterContainer params, EachCallback^ callback);

    sqlite3* sqlite;
    std::wstring lastErrorMsg;
  };
}

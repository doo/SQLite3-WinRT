#pragma once

#include "sqlite3.h"
#include "Common.h"

namespace SQLite3 {
  public delegate void ChangeHandler(Platform::Object^ event);

  public ref class Database sealed {
  public:
    static IAsyncOperation<Database^>^ OpenAsync(Platform::String^ dbPath);
    ~Database();

    IAsyncAction^ RunAsync(Platform::String^ sql, Parameters^ params);
    IAsyncOperation<Row^>^ OneAsync(Platform::String^ sql, Parameters^ params);
    IAsyncOperation<Rows^>^ AllAsync(Platform::String^ sql, Parameters^ params);
    IAsyncAction^ EachAsync(Platform::String^ sql, Parameters^ params, EachCallback^ callback);

    event ChangeHandler^ inserted;
    event ChangeHandler^ updated;
    event ChangeHandler^ deleted;

  private:
    Database(sqlite3* sqlite, Windows::UI::Core::CoreDispatcher^);
    StatementPtr PrepareAndBind(Platform::String^ sql, const SafeParameters& params);

    static void __cdecl updateHook(void* data, int what, char const* dbName, char const* tableName, sqlite3_int64 rowid);
    void OnChange(int what, char const* dbName, char const* tableName, sqlite3_int64 rowid);
    Windows::UI::Core::CoreDispatcher^ dispatcher;
    sqlite3* sqlite;
  };
}

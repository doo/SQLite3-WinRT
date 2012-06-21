#include <ppltasks.h>
#include <Winerror.h>

#include "Database.h"
#include "Statement.h"

namespace SQLite3
{
  IAsyncOperation<Database^>^ Database::OpenAsync(Platform::String^ dbPath) {
    return concurrency::create_async([dbPath]() {
      sqlite3* sqlite;
      int ret = sqlite3_open16(dbPath->Data(), &sqlite);

      if (ret != SQLITE_OK)
      {
        sqlite3_close(sqlite);

        HRESULT hresult = MAKE_HRESULT(SEVERITY_ERROR, FACILITY_ITF, ret);
        throw ref new Platform::COMException(hresult);
      }

      return ref new Database(sqlite);
    });
  }

  Database::Database(sqlite3* sqlite)
    : sqlite(sqlite)
  {
  }

  Database::~Database()
  {
    sqlite3_close(sqlite);
  }

  Statement^ Database::Prepare(Platform::String^ sql)
  {
    return ref new Statement(this, sql);
  }
}

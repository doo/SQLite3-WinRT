#include <Windows.h>

#include "Common.h"

namespace SQLite3 {
  void throwSQLiteError(int resultCode, Platform::String^ message) {
    HRESULT hresult;
    switch (resultCode) {
    case SQLITE_ERROR: hresult = E_FAIL; break;
    case SQLITE_ABORT: hresult = E_ABORT; break;
    case SQLITE_BUSY: hresult = HRESULT_FROM_WIN32(ERROR_BUSY); break;
    case SQLITE_LOCKED: hresult = HRESULT_FROM_WIN32(ERROR_LOCK_VIOLATION); break;
    case SQLITE_NOMEM: hresult = E_OUTOFMEMORY; break;
    case SQLITE_READONLY: hresult = HRESULT_FROM_WIN32(ERROR_FILE_READ_ONLY); break;
    case SQLITE_INTERRUPT: hresult = HRESULT_FROM_WIN32(ERROR_OPERATION_ABORTED); break;
    case SQLITE_IOERR: hresult = HRESULT_FROM_WIN32(ERROR_IO_DEVICE); break;
    case SQLITE_CORRUPT: hresult = HRESULT_FROM_WIN32(ERROR_DATABASE_FAILURE); break;   /* The database disk image is malformed */
    case SQLITE_NOTFOUND: hresult = HRESULT_FROM_WIN32(ERROR_INVALID_FUNCTION); break; /* Unknown opcode in sqlite3_file_control() */
    case SQLITE_FULL: hresult = HRESULT_FROM_WIN32(ERROR_DATABASE_FULL); break; /* Insertion failed because database is full */
    case SQLITE_CANTOPEN: hresult = HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND); break; /* Unable to open the database file */
    case SQLITE_PROTOCOL: hresult = E_INVALID_PROTOCOL_OPERATION; break;/* Database lock protocol error */
    case SQLITE_EMPTY: hresult = HRESULT_FROM_WIN32(ERROR_EMPTY); break;   /* Database is empty */
    case SQLITE_SCHEMA: hresult = E_CHANGED_STATE; break;/* The database schema changed */
    /*case SQLITE_TOOBIG: hresult = break;/* String or BLOB exceeds size limit */
    /*case SQLITE_CONSTRAINT: hresult = break;/* Abort due to constraint violation */
    case SQLITE_MISMATCH: hresult = HRESULT_FROM_WIN32(ERROR_DATATYPE_MISMATCH); break;/* Data type mismatch */
    /*case SQLITE_MISUSE: hresult = break;/* Library used incorrectly */
    case SQLITE_NOLFS: hresult = HRESULT_FROM_WIN32(ERROR_NOT_SUPPORTED); break;/* Uses OS features not supported on host */
    case SQLITE_AUTH: hresult = HRESULT_FROM_WIN32(ERROR_NOT_AUTHENTICATED); break;/* Authorization denied */
    case SQLITE_FORMAT: hresult = HRESULT_FROM_WIN32(ERROR_FILE_CORRUPT); break;/* Auxiliary database format error */
    case SQLITE_RANGE: hresult = E_BOUNDS; break;/* 2nd parameter to sqlite3_bind out of range */
    case SQLITE_NOTADB: hresult = HRESULT_FROM_WIN32(ERROR_DATABASE_DOES_NOT_EXIST); break;   /* File opened that is not a database file */
    default:
      hresult = MAKE_HRESULT(SEVERITY_ERROR, FACILITY_ITF, resultCode);
      hresult |= 0x20000000; // Set "customer-defined" bit
    }
    OutputDebugStringW(message->Data());
    OutputDebugStringW(L"\n");
    throw ref new Platform::COMException(hresult, message);
  }

  std::wstring ToWString(const char* utf8String, unsigned int length) {
    DWORD numCharacters = MultiByteToWideChar(CP_UTF8, 0, utf8String, length, nullptr, 0);
    auto wideText = new std::wstring::value_type[numCharacters];
    MultiByteToWideChar(CP_UTF8, 0, utf8String, length, wideText, numCharacters);
    std::wstring result(wideText);
    delete[] wideText;
    return result;
  }

  Platform::String^ ToPlatformString(const char* utf8String, unsigned int length) {
    return ref new Platform::String(ToWString(utf8String, length).data());
  }
}

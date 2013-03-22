#include <assert.h>
#include <collection.h>
#include <sstream>
#include <iomanip>

#include <ppl.h>
#include <ppltasks.h>

#include <windows.storage.h>
#include <robuffer.h>

#include "Statement.h"
#include "Database.h"

namespace SQLite3 {
  StatementPtr Statement::Prepare(sqlite3* sqlite, Platform::String^ sql) {
    sqlite3_stmt* statement;
    int ret = sqlite3_prepare16(sqlite, sql->Data(), -1, &statement, 0);

    if (ret != SQLITE_OK) {
      sqlite3_finalize(statement);
      throwSQLiteError(ret, sql);
    }

    return StatementPtr(new Statement(statement));
  }

  Statement::Statement(sqlite3_stmt* statement)
    : statement(statement) {
  }

  Statement::~Statement() {
    sqlite3_finalize(statement);
  }

  void Statement::Bind(const SafeParameterVector& params) {
    for (SafeParameterVector::size_type i = 0; i < params.size(); ++i) {
      BindParameter(static_cast<int>(i + 1), params[i]);
    }
  }

  void Statement::Bind(ParameterMap^ params) {
    if (!params) {
      return;
    }

    for (int i = 0; i < BindParameterCount(); ++i) {
      int index = i + 1;
      auto nameWithoutPrefix = BindParameterName(index).substr(1);
      auto name = ref new Platform::String(nameWithoutPrefix.data());
      if (params->HasKey(name)) {
        BindParameter(index, params->Lookup(name));
      }
    }
  }

  static inline uint64 FoundationTimeToUnixCompatible(Windows::Foundation::DateTime foundationTime) {
    return (foundationTime.UniversalTime / 10000) - 11644473600000;
  }

  void Statement::BindParameter(int index, Platform::Object^ value) {
    int result;
    if (value == nullptr) {
      result = sqlite3_bind_null(statement, index);
    } else {
      auto typeCode = Platform::Type::GetTypeCode(value->GetType());
      switch (typeCode) {
      case Platform::TypeCode::DateTime:
        result = sqlite3_bind_int64(statement, index, FoundationTimeToUnixCompatible(static_cast<Windows::Foundation::DateTime>(value)));
        break;
      case Platform::TypeCode::Double:
        result = sqlite3_bind_double(statement, index, static_cast<double>(value));
        break;
      case Platform::TypeCode::String:
        result = sqlite3_bind_text16(statement, index, static_cast<Platform::String^>(value)->Data(), -1, SQLITE_TRANSIENT);
        break;
      case Platform::TypeCode::Boolean:
        result = sqlite3_bind_int(statement, index, static_cast<Platform::Boolean>(value) ? 1 : 0);
        break;
      case Platform::TypeCode::Int8:
      case Platform::TypeCode::Int16:
      case Platform::TypeCode::Int32:
      case Platform::TypeCode::UInt8:
      case Platform::TypeCode::UInt16:
      case Platform::TypeCode::UInt32:
        result = sqlite3_bind_int(statement, index, static_cast<int>(value));
        break;
      case Platform::TypeCode::Int64:
      case Platform::TypeCode::UInt64:
        result = sqlite3_bind_int64(statement, index, static_cast<int64>(value));
        break;
      case Platform::TypeCode::Object: {
          auto buffer= winrt_as<ABI::Windows::Storage::Streams::IBuffer>(value);
          if (buffer) {
            auto byteBuffer= winrt_as<Windows::Storage::Streams::IBufferByteAccess>(value);
            byte* blob;
            byteBuffer->Buffer(&blob);
            uint32 length;
            buffer->get_Length(&length);
            result = sqlite3_bind_blob(statement, index, blob, length, 0);
          } else {
            result = SQLITE_MISMATCH;
          }
        }
        break;
      default:
        result = SQLITE_MISMATCH;      
      }
    }
    if (result != SQLITE_OK) {
      std::wostringstream message;
      message << L"Could not bind parameter " 
              << index 
              << L" to " 
              << value->ToString()->Data() 
              << L" because it has a wrong type " 
              << value->GetType()->FullName->Data();
      throwSQLiteError(result, ref new Platform::String(message.str().c_str()));
    }
  }

  int Statement::BindParameterCount() {
    return sqlite3_bind_parameter_count(statement);
  }

  std::wstring Statement::BindParameterName(int index) {
    return ToWString(sqlite3_bind_parameter_name(statement, index));
  }

  void Statement::Run() {
    Step();
  }

  Platform::String^ Statement::One() {
    std::wostringstream result;
    if (Step() == SQLITE_ROW) {
      GetRow(result);
      return ref new Platform::String(result.str().c_str());
    } else {
      return nullptr;
    }
  }

  Platform::String^ Statement::All() {
    std::wostringstream result;
    result << L"[";
    auto stepResult = Step();
    bool hasData = (stepResult == SQLITE_ROW);
    while (stepResult == SQLITE_ROW) {
      GetRow(result);
      result << L",";
      stepResult = Step();
    }
    if (hasData) {
      std::streamoff pos = result.tellp();
      result.seekp(pos-1);
    }
    result << L"]";
    return ref new Platform::String(result.str().c_str());
  }

  void Statement::Each(EachCallback^ callback, Windows::UI::Core::CoreDispatcher^ dispatcher) {
    while (Step() == SQLITE_ROW) {
      std::wostringstream output;
      GetRow(output);
      auto row = ref new Platform::String(output.str().c_str());
      auto callbackTask = Concurrency::task<void>(
        dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::Normal, 
        ref new Windows::UI::Core::DispatchedHandler([row, callback]() {
          callback(row);
        }))
      );
      callbackTask.get();    
    }
  }


  int Statement::Step() {
    int ret = sqlite3_step(statement);
  
    if (ret != SQLITE_ROW && ret != SQLITE_DONE) {
      throwSQLiteError(ret, ref new Platform::String(L"Could not step statement"));
    }

    return ret;
  }

  bool Statement::ReadOnly() const {
    return sqlite3_stmt_readonly(statement) != 0;
  }

  void writeEscaped(const std::wstring& s, std::wostringstream& out) {
    out << L'"';
    for (std::wstring::const_iterator i = s.begin(), end = s.end(); i != end; ++i) {
      wchar_t c = *i;
      if (L' ' <= c && c <= L'~' && c != L'\\' && c != L'"') {
        out << *i;
      }
      else {
        out << L'\\';
        switch(c) {
        case L'"':  out << L'"';  break;
        case L'\\': out << L'\\'; break;
        case L'\t': out << L't';  break;
        case L'\r': out << L'r';  break;
        case L'\n': out << L'n';  break;
        default:
          out << L'u';
          out << std::setw(4) << std::setfill(L'0') << std::hex << (WORD)c;
        }
      }
    }
    out << L'"';
  }

  void Statement::GetRow(std::wostringstream& outstream) {
    outstream << L'{';
    int columnCount = ColumnCount();
    for (int i = 0; i < columnCount; ++i) {
      auto colName = static_cast<const wchar_t*>(sqlite3_column_name16(statement, i));
      auto colType = ColumnType(i);      
      outstream << L'"' << colName  << L"\":";
      switch (colType) {
      case SQLITE_TEXT: {
          auto colValue = static_cast<const wchar_t*>(sqlite3_column_text16(statement, i));      
          writeEscaped(colValue, outstream);
        }
        break;
      case SQLITE_INTEGER:
      case SQLITE_FLOAT: {
          auto colValue = static_cast<const wchar_t*>(sqlite3_column_text16(statement, i));      
          outstream << colValue;
        }
        break;
      case SQLITE_BLOB: {
          auto blob = (byte*)sqlite3_column_blob(statement, i);
          const int blobSize = sqlite3_column_bytes(statement, i);
          Platform::ArrayReference<uint8> blobArray(blob, blobSize);
          using Windows::Security::Cryptography::CryptographicBuffer;
          auto base64Text = CryptographicBuffer::EncodeToBase64String(CryptographicBuffer::CreateFromByteArray(blobArray));    
          outstream << L'"' << base64Text->Data() << L'"';
        }
        break;
      case SQLITE_NULL:
        outstream << L"null";
        break;
      }
      outstream << L',';
    }
    std::streamoff pos = outstream.tellp();
    outstream.seekp(pos - 1l);
    outstream << L'}';
  }

  int Statement::ColumnCount() {
    return sqlite3_column_count(statement);
  }

  int Statement::ColumnType(int index) {
    return sqlite3_column_type(statement, index);
  }
}

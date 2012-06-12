(function () {
  "use strict";

  var Statement, Database;

  // Alternative typeof implementation yielding more meaningful results,
  // see http://javascriptweblog.wordpress.com/2011/08/08/fixing-the-javascript-typeof-operator/
  function type(obj) {
    var typeString;

    typeString = Object.prototype.toString.call(obj);
    return typeString.substring(8, typeString.length - 1).toLowerCase();
  }

  function throwSQLiteError(message, comException) {
    var error = new Error(message);
    error.resultCode = comException.number & 0xffff;
    throw error;
  }

  Statement = WinJS.Class.define(function (db, sql, args) {
    try {
      this.statement = db.connection.prepare(sql);
    } catch (comException) {
      throwSQLiteError('Error preparing an SQLite statement.', comException);
    }

    if (args) {
      this.bind(args);
    }
  }, {
    bind: function (args) {
      var index, resultCode;

      args.forEach(function (arg, i) {
        index = i + 1;
        switch (type(arg)) {
          case 'number':
            if (arg % 1 === 0) {
              resultCode = this.statement.bindInt(index, arg);
            } else {
              resultCode = this.statement.bindDouble(index, arg);
            }
            break;
          case 'string':
            resultCode = this.statement.bindText(index, arg);
            break;
          case 'null':
            resultCode = this.statement.bindNull(index);
            break;
          default:
            throw new Error("Unsupported argument type: " + type(arg));
        }
        if (resultCode !== SQLite3.ResultCode.ok) {
          throw new Error("Error " + resultCode + " when binding argument to SQL query.");
        }
      }, this);
    },
    run: function () {
      this.statement.step();
    },
    all: function () {
      var result = [];

      this.each(function (row) {
        result.push(row);
      });
      return result;
    },
    each: function (callback) {
      var row, i, len, name;

      while (this.statement.step() === SQLite3.ResultCode.row) {
        row = {};
        for (i = 0, len = this.statement.columnCount() ; i < len; i += 1) {
          name = this.statement.columnName(i);
          switch (this.statement.columnType(i)) {
            case SQLite3.Datatype.integer:
              row[name] = this.statement.columnInt(i);
              break;
            case SQLite3.Datatype.float:
              row[name] = this.statement.columnDouble(i);
              break;
            case SQLite3.Datatype.text:
              row[name] = this.statement.columnText(i);
              break;
            case SQLite3.Datatype["null"]:
              row[name] = null;
              break;
          }
        }
        callback(row);
      }
    },
    close: function () {
      this.statement.close();
    }
  });

  Database = WinJS.Class.define(function (dbPath) {
    try {
      this.connection = SQLite3.Database(dbPath);
    } catch (comException) {
      throwSQLiteError('Error creating an SQLite database connection.', comException);
    }
  }, {
    run: function (sql, args) {
      var statement = new Statement(this, sql, args);

      statement.run();
      statement.close();
    },
    all: function (sql, args) {
      var rows, statement = new Statement(this, sql, args);

      rows = statement.all();
      statement.close();
      return rows;
    },
    each: function (sql, args, callback) {
      if (!callback && type(args) === 'function') {
        callback = args;
        args = null;
      }

      var statement = new Statement(this, sql, args);

      statement.each(callback);
      statement.close();
    },
    close: function () {
      this.connection.close();
    }
});

WinJS.Namespace.define('SQLite3JS', {
  Database: Database
});

}());

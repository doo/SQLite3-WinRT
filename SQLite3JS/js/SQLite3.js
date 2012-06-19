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
    one: function () {
      this.statement.step();
      return this._getRow();
    },
    all: function () {
      var result = [];

      this.each(function (row) {
        result.push(row);
      });
      return result;
    },
    each: function (callback) {
      while (this.statement.step() === SQLite3.ResultCode.row) {
        callback(this._getRow());
      }
    },
    map: function (callback) {
      var result = [];

      this.each(function (row) {
        result.push(callback(row));
      });
      return result;
    },
    close: function () {
      this.statement.close();
    },
    _getRow: function () {
      var i, len, name, row = {};

      for (i = 0, len = this.statement.columnCount() ; i < len; i += 1) {
        name = this.statement.columnName(i);
        row[name] = this._getColumn(i);
      }

      return row;
    },
    _getColumn: function (index) {
      switch (this.statement.columnType(index)) {
        case SQLite3.Datatype.integer:
          return this.statement.columnInt(index);
        case SQLite3.Datatype.float:
          return this.statement.columnDouble(index);
        case SQLite3.Datatype.text:
          return this.statement.columnText(index);
        case SQLite3.Datatype["null"]:
          return null;
        default:
          throw new Error('Unsupported column type.');
      }
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
      var statement = this.prepare(sql, args);

      statement.run();
      statement.close();
    },
    one: function (sql, args) {
      var row, statement = this.prepare(sql, args);

      row = statement.one();
      statement.close();
      return row;
    },
    all: function (sql, args) {
      var rows, statement = this.prepare(sql, args);

      rows = statement.all();
      statement.close();
      return rows;
    },
    each: function (sql, args, callback) {
      if (!callback && type(args) === 'function') {
        callback = args;
        args = null;
      }

      var statement = this.prepare(sql, args);

      statement.each(callback);
      statement.close();
    },
    map: function (sql, args, callback) {
      if (!callback && type(args) === 'function') {
        callback = args;
        args = null;
      }

      var rows, statement = this.prepare(sql, args);

      rows = statement.map(callback);
      statement.close();
      return rows;
    },
    prepare: function (sql, args) {
      return new Statement(this, sql, args);
    },
    close: function () {
      this.connection.close();
    }
  });

  WinJS.Namespace.define('SQLite3JS', {
    Database: Database
  });

}());

(function () {
  "use strict";

  var ItemDataSource, GroupDataSource, MAX_CONNECTIONS = 5, transactionsByDbPath = {};

  function PromiseQueue() {
    this._items = [];
    this._busy = false;
  }

  PromiseQueue.prototype.append = function (createPromise) {
    var wrappingPromise,
        queueItem = { createPromise: createPromise },
        _this = this;

    wrappingPromise = new WinJS.Promise(function (complete, error) {
      queueItem.complete = complete;
      queueItem.error = error;
    }, function () {
      if (queueItem.promise) {
        queueItem.promise.cancel();
      } else {
        queueItem.cancelled = true;
      }

      _this._handleNext();
    });

    this._items.push(queueItem);
    if (!this._busy) {
      this._handleNext();
    }

    return wrappingPromise;
  };

  PromiseQueue.prototype._handleNext = function () {
    var _this = this;
    /* shorten call stack */
    this._busy = true;
    setImmediate(function () {
      if (_this._items.length > 0) {
        var nextItem = _this._items[0];
        _this._items = _this._items.slice(1);
        _this._handleItem(nextItem);
      } else {
        _this._busy = false;
      }
    });
  };

  PromiseQueue.prototype._handleItem = function (queueItem) {
    var _this = this;

    if (!queueItem.cancelled) {
      queueItem.promise = queueItem.createPromise();
      queueItem.promise.done(function (result) {
        _this._handleNext();
        queueItem.complete(result);
      }, function (error) {
        _this._handleNext();
        queueItem.error(error);
      });
    } else {
      this._handleNext();
    }
  };

  function toPropertySet(object) {
    var key, propertySet = new Windows.Foundation.Collections.PropertySet();

    for (key in object) {
      if (object.hasOwnProperty(key)) {
        propertySet.insert(key, object[key]);
      }
    }

    return propertySet;
  }

  function prepareArgs(args) {
    args = args || [];
    return (args instanceof Array) ? args : toPropertySet(args);
  }

  function formatStatementAndArgs(sql, args) {
    var argString = args ? ' ' + args.toString() : '';
    return '"' + sql + '", ' + argString;
  }

  function convertException(exception, detailedMessage, functionName, sql, args) {
    var error, message, resultCode, number;

    if (exception.hasOwnProperty('number')) {
      // Convert the COM error to an unsigned hex value that we can check in JS like E_FAIL == 0x80004005
      number = 0xffffffff + exception.number + 1;
      resultCode = number & 0x20000000 ? exception.number & 0xffff : 0;
      message = (resultCode > 0 ? resultCode : "0x" + number.toString(16)) + ": ";
      if (functionName) {
        message += functionName;

        if (sql) {
          message += '(' + formatStatementAndArgs(sql, args) + ') ';
        } else {
          message += " ";
        }
      }
      if (detailedMessage) {
        message += detailedMessage;
      }
      error = new WinJS.ErrorFromName("SQLiteError", message);
      error.resultCode = resultCode;
      error.number = number;
      error.sql = sql;
      error.args = args;
      error.functionName = functionName;
    } else {
      error = exception;
    }

    return error;
  }

  function wrapDatabase(connection) {
    var that, queue = new PromiseQueue();

    function runNextWaitingCommand() {
      if (transactionsByDbPath[connection.path] && transactionsByDbPath[connection.path].queue.length > 0) {
        var waitingFunction = transactionsByDbPath[connection.path].queue.splice(0, 1)[0];
        setImmediate(waitingFunction);
      }
    }

    function notifyTransactionComplete(connection, isSeparateConnection) {
      if (isSeparateConnection) {
        connection.close();
        transactionsByDbPath[connection.path].counter -= 1;
      }
      runNextWaitingCommand();
    }

    function getTransactionConnectionAsync(currentConnection, createNewConnection) {
      if (createNewConnection) {
        if (transactionsByDbPath[connection.path] === undefined) {
          transactionsByDbPath[connection.path] = {
            counter: 1,
            queue: []
          };
          return SQLite3JS.openAsync(currentConnection.path);
        }
        if (transactionsByDbPath[connection.path].counter < MAX_CONNECTIONS) {
          transactionsByDbPath[connection.path].counter += 1;
          return SQLite3JS.openAsync(currentConnection.path);
        }
        return new WinJS.Promise(function (complete) {
          transactionsByDbPath[connection.path].queue.push(function () {
            return getTransactionConnectionAsync(currentConnection, createNewConnection).then(complete);
          });
        });
      }
      return WinJS.Promise.wrap(currentConnection);
    }

    function callNativeAsync(funcName, sql, args, callback) {
      var argString, preparedArgs, fullFuncName, workFunction;

      if (SQLite3JS.debug) {
        SQLite3JS.logger.trace(funcName + ': ' + formatStatementAndArgs(sql, args));
      }
      workFunction = function () {
        preparedArgs = prepareArgs(args);
        fullFuncName =
          preparedArgs instanceof Windows.Foundation.Collections.PropertySet
          ? funcName + "Map"
          : funcName + "Vector";

        return connection[fullFuncName](sql, preparedArgs, callback).then(null, function (error) {
          error = convertException(error);
          if (error.number === 0x800700aa || error.number === 0x80070021) { // they both indicate locking apparently
            if (transactionsByDbPath[connection.path].counter > 1) {
              // the database was busy, wait for some transaction to complete and then try again
              var promise = new WinJS.Promise(function (complete) {
                transactionsByDbPath[connection.path].queue.push(function () {
                  //complete(transactionAware.apply(_that, args));
                  complete(workFunction());
                });
              });
              //promise.done(runNextWaitingCommand);
              return promise;
            }
            return new WinJS.Promise.timeout(50).then(workFunction);
          }
          // all other errors should just be passed on as normal
          return WinJS.Promise.wrapError(error);
        });
      };

      return queue.append(workFunction);
    }

    that = {
      runAsync: function (sql, args) {
        return callNativeAsync('runAsync', sql, args).then(function (affectedRowCount) {
          return affectedRowCount;
        });
      },
      oneAsync: function (sql, args) {
        return callNativeAsync('oneAsync', sql, args).then(function (row) {
          return row ? JSON.parse(row) : null;
        });
      },
      allAsync: function (sql, args) {
        return callNativeAsync('allAsync', sql, args).then(function (rows) {
          return rows ? JSON.parse(rows) : null;
        });
      },
      eachAsync: function (sql, args, callback) {
        if (!callback && typeof args === 'function') {
          callback = args;
          args = undefined;
        }

        return callNativeAsync('eachAsync', sql, args, function (row) {
          callback(JSON.parse(row));
        }).then(function () {
          return that;
        });
      },
      mapAsync: function (sql, args, callback) {
        if (!callback && typeof args === 'function') {
          callback = args;
          args = undefined;
        }

        var results = [];

        return that.eachAsync(sql, args, function (row) {
          results.push(callback(row));
        }).then(function () {
          return results;
        });
      },
      itemDataSource: function (sql, args, keyColumnName, groupKeyColumnName) {
        if (typeof args === 'string') {
          groupKeyColumnName = keyColumnName;
          keyColumnName = args;
          args = undefined;
        }

        return new ItemDataSource(that, sql, args, keyColumnName, groupKeyColumnName);
      },
      groupDataSource: function (sql, args, keyColumnName, sizeColumnName) {
        if (typeof args === 'string') {
          sizeColumnName = keyColumnName;
          keyColumnName = args;
          args = undefined;
        }

        return new GroupDataSource(that, sql, args, keyColumnName, sizeColumnName);
      },
      close: function () {
        connection.close();
      },
      vacuumAsync: function () {
        return connection.vacuumAsync();
      },
      withTransactionAsync: function (callback, transactionMode, useNewConnection, initializer) {
        if (useNewConnection === undefined) {
          useNewConnection = true;
        } else if (useNewConnection === true && connection.path === ":memory:") {
          useNewConnection = false;
        }
        if (transactionMode === undefined) {
          transactionMode = SQLite3JS.TransactionMode.deferred;
        }
        return getTransactionConnectionAsync(that, useNewConnection)
        .then(function (txConnection) {
          if (initializer) {
            return WinJS.Promise.as(initializer(txConnection)).then(function () {
              return txConnection;
            });
          }
          return txConnection;
        })
        .then(function (txConnection) {
          return txConnection.runAsync("BEGIN " + transactionMode + " TRANSACTION")
          .then(function () {
            return WinJS.Promise.as(callback(txConnection));
          })
          .then(function (originalResult) {
            return txConnection.runAsync("COMMIT TRANSACTION")
            .then(function () {
              notifyTransactionComplete(txConnection, useNewConnection);
              if (originalResult !== that) {
                return originalResult;
              }
            });
          }, function (error) {
            return txConnection.runAsync("ROLLBACK TRANSACTION")
            .then(function () {
              notifyTransactionComplete(txConnection, useNewConnection);
              return WinJS.Promise.wrapError(error);
            });
          });
        });
      },
      addEventListener: connection.addEventListener.bind(connection),
      removeEventListener: connection.removeEventListener.bind(connection)
    };

    Object.defineProperties(
      that,
      WinJS.Utilities.createEventProperties('update', 'delete', 'insert')
    );

    Object.defineProperties(that, {
      "collationLanguage": {
        set: function (value) { connection.collationLanguage = value; },
        get: function () { return connection.collationLanguage; },
        enumerable: true
      },
      "fireEvents": {
        set: function (value) { connection.fireEvents = value; },
        get: function () { return connection.fireEvents; },
        enumerable: true
      },
      "lastError": {
        get: function () { return connection.lastError; },
        enumerable: true
      },
      "autoCommit": {
        get: function () { return connection.autoCommit; },
        enumerable: true
      },
      "lastInsertRowId": {
        get: function () { return connection.lastInsertRowId; },
        enumerable: true
      },
      "path": {
        get: function () { return connection.path; },
        enumerable: true
      }
    });

    return that;
  }

  ItemDataSource = WinJS.Class.derive(WinJS.UI.VirtualizedDataSource,
    function (db, sql, args, keyColumnName, groupKeyColumnName) {
      this._dataAdapter = {
        setQuery: function (sql, args) {
          this._sql = sql;
          this._args = args;
        },
        getCount: function () {
          return db.oneAsync('SELECT COUNT(*) AS cnt FROM (' + this._sql + ')', this._args)
          .then(function (row) { return row.cnt; });
        },
        itemsFromIndex: function (requestIndex, countBefore, countAfter) {
          var items,
              limit = countBefore + 1 + countAfter,
              offset = requestIndex - countBefore,
              that = this;

          return this.getCount().then(function (totalCount) {
            return db.mapAsync(
              'SELECT * FROM (' + that._sql + ') LIMIT ' + limit + ' OFFSET ' + offset,
              that._args,
              function (row) {
                var item = {
                  key: row[keyColumnName].toString(),
                  data: row
                };
                if (groupKeyColumnName) {
                  if (!row.hasOwnProperty(groupKeyColumnName) || row[groupKeyColumnName] === null) {
                    throw "Group key property not found: " + groupKeyColumnName;
                  }
                  item.groupKey = row[groupKeyColumnName].toString();
                }
                return item;
              }).then(function (items) {
                return {
                  items: items,
                  offset: countBefore,
                  totalCount: totalCount
                };
              });
          });
        },
        setNotificationHandler: function (notificationHandler) {
          this._notificationHandler = notificationHandler;
        },
        getNotificationHandler: function () {
          return this._notificationHandler;
        }
      };

      this._dataAdapter.setQuery(sql, args);
      this._baseDataSourceConstructor(this._dataAdapter);
    }, {
      setQuery: function (sql, args) {
        this._dataAdapter.setQuery(sql, args);
        this.invalidateAll();
      },
      getNotificationHandler: function () {
        return this._dataAdapter.getNotificationHandler();
      }
    }
  );

  GroupDataSource = WinJS.Class.derive(WinJS.UI.VirtualizedDataSource,
    function (db, sql, args, keyColumnName, sizeColumnName) {
      var dataAdapter = {
        _keyIndexMap: {},
        _ensureGroupsAsync: function () {
          if (dataAdapter._groups) {
            return WinJS.Promise.wrap();
          }

          var groupIndex = 0,
              firstItemIndex = 0;
          return db.mapAsync(sql, args, function (row) {
            var item = {
              key: row[keyColumnName].toString(),
              groupSize: row[sizeColumnName],
              firstItemIndexHint: firstItemIndex,
              data: row
            };

            dataAdapter._keyIndexMap[item.key] = groupIndex;
            groupIndex += 1;
            firstItemIndex += item.groupSize;

            return item;
          }).then(function (groups) {
            dataAdapter._groups = groups.filter(function (group) { return group.groupSize > 0; });
          });
        },
        getCount: function () {
          return dataAdapter._ensureGroupsAsync().then(function () {
            return dataAdapter._groups.length;
          });
        },
        itemsFromIndex: function (requestIndex, countBefore, countAfter) {
          return dataAdapter._ensureGroupsAsync().then(function () {
            return {
              items: dataAdapter._groups.slice(),
              offset: requestIndex,
              absoluteIndex: requestIndex,
              totalCount: dataAdapter._groups.length,
              atStart: true,
              atEnd: true
            };
          });
        },
        itemsFromKey: function (key, countBefore, countAfter) {
          return dataAdapter._ensureGroupsAsync().then(function () {
            return dataAdapter.itemsFromIndex(dataAdapter._keyIndexMap[key], countBefore, countAfter);
          });
        },
        setNotificationHandler: function (notificationHandler) {
          this._notificationHandler = notificationHandler;
        },
        getNotificationHandler: function () {
          return this._notificationHandler;
        }
      };
      this._dataAdapter = dataAdapter;
      this._baseDataSourceConstructor(dataAdapter);
    }, {
      getNotificationHandler: function () {
        return this._dataAdapter.getNotificationHandler();
      }
    }
  );

  function openAsync(dbPath) {
    /// <summary>
    /// Opens a database from disk or in memory.
    /// </summary>
    /// <param name="dbPath" type="String">
    /// Path to a file that is located in your apps local/temp/roaming storage or the string ":memory:" 
    /// to create a database in memory
    /// </param>
    /// <returns>Database object upon completion of the promise</returns>
    return SQLite3.Database.openAsync(dbPath)
    .then(function opened(connection) {
      var db = wrapDatabase(connection);
      if (SQLite3JS.version) {
        return db;
      }
      return db.oneAsync("SELECT sqlite_version() || ' (' || sqlite_source_id() || ')' as version")
      .then(function (result) {
        SQLite3JS.logger.info("SQLite3 version: " + (SQLite3JS.version = result.version));
        return db;
      });
    }, function onerror(error) {
      return WinJS.Promise.wrapError(convertException(error, 'Could not open database "' + dbPath + '"', "openAsync"));
    });
  }
  
  WinJS.Namespace.define("SQLite3JS.TransactionMode", {
    deferred: {
      get: function () {
        return "DEFERRED";
      }
    },
    immediate: {
      get: function () {
        return "IMMEDIATE";
      }
    },
    exclusive: {
      get: function () {
        return "EXCLUSIVE";
      }
    }
  });

  WinJS.Namespace.define("SQLite3JS", {
    openAsync: openAsync,
    /// Set this to true to get some more logging output
    debug: false,
    logger: {
      trace: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console)
    }
  });

}());

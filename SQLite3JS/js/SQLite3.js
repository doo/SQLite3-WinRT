var SQLite3JS = (function () {
  "use strict";

  var SQLite3JS, Database, ItemDataSource, GroupDataSource;

  SQLite3JS = {
    debug: false,
    log: console.log.bind(console)
  };

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
        _this._busy = false;;
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

  function wrapException(exception, detailedMessage) {
    var error, message, resultCode;

    if (exception.hasOwnProperty('number')) {
      resultCode = exception.number & 0xffff;
      message = 'SQLite Error ' + resultCode;
      if (detailedMessage) {
        message += ': ' + detailedMessage;
      }
      error = {
        message: message,
        resultCode: resultCode
      };
    } else {
      error = exception;
    }

    return WinJS.Promise.wrapError(error);
  }

  function wrapDatabase(connection) {
    var that, queue = new PromiseQueue();

    function callNativeAsync(funcName, sql, args, callback) {
      var argString, preparedArgs, fullFuncName;

      if (SQLite3JS.debug) {
        argString = args ? ' ' + args.toString() : '';
        SQLite3JS.log('Database#' + funcName + ': ' + sql + argString);
      }

      return queue.append(function () {
        preparedArgs = prepareArgs(args);
        fullFuncName =
          preparedArgs instanceof Windows.Foundation.Collections.PropertySet
          ? funcName + "Map"
          : funcName + "Vector";

        return connection[fullFuncName](sql, preparedArgs, callback).then(null, function (error) {
          return wrapException(error, that.getLastError());
        });
      });
    }

    that = {
      runAsync: function (sql, args) {
        return callNativeAsync('runAsync', sql, args).then(function () {
          return that;
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
      getLastInsertRowId: function () {
        return connection.getLastInsertRowId();
      },
      getAutocommit: function () {
        return connection.getAutocommit();
      },
      getLastError: function () {
        return connection.getLastError();
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
        return new WinJS.Promise( function(complete) {
          connection.vacuumAsync();
          complete();
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

  SQLite3JS.openAsync = function (dbPath) {
    try {
      var db = wrapDatabase(SQLite3.Database.open(dbPath));
      return WinJS.Promise.wrap(db);
    } catch (error) {
      return wrapException(error);
    }
  };

  return SQLite3JS;
}());

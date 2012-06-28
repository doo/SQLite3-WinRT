describe('SQLite3JS', function () {
  function notNull(object) {
    return object !== null;
  }

  function errorMessage(error) {
    return error.message;
  }

  function waitsForPromise(promise) {
    var done = false;

    promise.then(function () {
      done = true;
    }, function (error) {
      var message;

      if (error.constructor === Array) {
        message = error.filter(notNull).map(errorMessage).join(', ');
      } else {
        message = errorMessage(error);
      }

      jasmine.getEnv().currentSpec.fail(message);
      done = true;
    });

    waitsFor(function () { return done; });
  }

  var db = null;

  beforeEach(function () {
    waitsForPromise(
      SQLite3JS.openAsync(':memory:').then(function (newDb) {
        db = newDb;
        return db.runAsync('CREATE TABLE Item (name TEXT, price REAL, id INT PRIMARY KEY)').then(function () {
          var promises = [
            db.runAsync('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Apple', 1.2, 1]),
            db.runAsync('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Orange', 2.5, 2]),
            db.runAsync('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Banana', 3, 3])
          ];
          return WinJS.Promise.join(promises);
        });
      })
    );
  });

  afterEach(function () {
    waitsForPromise(
      db.runAsync('DROP TABLE Item').then(function () {
        db.close();
      })
    );
  });

  describe('runAsync()', function () {
    it('should allow chaining', function () {
      waitsForPromise(
        db.runAsync('DELETE FROM Item WHERE id = 1')
          .then(function (chainedDb) {
            return chainedDb.oneAsync('SELECT COUNT(*) AS count FROM Item');
          })
          .then(function (row) {
            expect(row.count).toEqual(2);
          })
      );
    });

    it('should allow binding null arguments', function () {
      var name = 'Mango';

      waitsForPromise(
        db.runAsync('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', [name, null, null])
          .then(function () {
            return db.oneAsync('SELECT * FROM Item WHERE name = ?', [name]);
          })
          .then(function (row) {
            expect(row.name).toEqual(name);
            expect(row.price).toEqual(null);
            expect(row.id).toEqual(null);
          })
      );
    });

    it('should allow binding arguments by name', function () {
      waitsForPromise(
        db.runAsync(
          'INSERT INTO Item (name, price, id) VALUES (:name, :price, :id)',
          { name: 'Papaya', price: 5.2, id: 4 })
          .then(function () {
            return db.oneAsync(
              'SELECT COUNT(*) AS cnt FROM Item WHERE price > :limit',
              { limit: 5 });
          })
          .then(function (row) {
            expect(row.cnt).toEqual(1);
          })
      );
    });
  });

  describe('oneAsync()', function () {
    it('should return the correct count', function () {
      waitsForPromise(
        db.oneAsync('SELECT COUNT(*) AS count FROM Item').then(function (row) {
          expect(row.count).toEqual(3);
        })
      );
    });

    it('should return an item by id', function () {
      waitsForPromise(
        db.oneAsync('SELECT * FROM Item WHERE id = ?', [2]).then(function (row) {
          expect(row.name).toEqual('Orange');
          expect(row.price).toEqual(2.5);
          expect(row.id).toEqual(2);
        })
      );
    });

    it('should return null for empty queries', function () {
      waitsForPromise(
        db.oneAsync('SELECT * FROM Item WHERE name = ?', ['BEEF']).then(function (row) {
          expect(row).toBeNull();
        })
      );
    });
  });

  describe('allAsync()', function () {
    it('should return items with names ending on "e"', function () {
      waitsForPromise(
        db.allAsync(
          'SELECT * FROM Item WHERE name LIKE :pattern ORDER BY id ASC',
          { pattern: '%e' })
          .then(function (rows) {
            expect(rows.length).toEqual(2);
            expect(rows[0].name).toEqual('Apple');
            expect(rows[1].name).toEqual('Orange');
          })
      );
    });

    it('should return empty array for empty queries', function () {
      waitsForPromise(
        db.allAsync('SELECT * FROM Item WHERE id < ?', [0]).then(function (rows) {
          expect(rows.length).toEqual(0);
        })
      );
    });
  });

  describe('eachAsync()', function () {
    var ids;

    beforeEach(function () {
      ids = [];
      this.rememberId = function (row) { ids.push(row.id); };
    });

    it('should call a callback for each row', function () {
      waitsForPromise(
        db.eachAsync('SELECT * FROM Item ORDER BY id', this.rememberId)
          .then(function () {
            expect(ids).toEqual([1, 2, 3]);
          })
      );
    });

    it('should allow binding arguments', function () {
      waitsForPromise(
        db.eachAsync('SELECT * FROM Item WHERE price > ? ORDER BY id', [2], this.rememberId)
          .then(function () {
            expect(ids).toEqual([2, 3]);
          })
      );
    });

    it('should allow binding arguments by name', function () {
      waitsForPromise(
        db.eachAsync(
          'SELECT * FROM Item WHERE price < :max ORDER BY id',
          { max: 3 },
          this.rememberId).then(function () {
            expect(ids).toEqual([1, 2]);
          })
      );
    });
  });

  describe('mapAsync()', function () {
    it('should map a function over all rows', function () {
      waitsForPromise(
        db.mapAsync('SELECT * FROM Item ORDER BY id', function (row) {
          return row.price > 2 ? 'expensive' : 'cheap';
        }).then(function (rating) {
          expect(rating.length).toEqual(3);
          expect(rating[0]).toEqual('cheap');
          expect(rating[1]).toEqual('expensive');
          expect(rating[2]).toEqual('expensive');
        })
      );
    });
  });

  describe('getLastInsertRowId()', function () {
    it('should retrieve the id of the last inserted row', function () {
      waitsForPromise(
        db.runAsync("INSERT INTO Item (name) VALUES (?)", ['Ananas']).then(function () {
          id = db.getLastInsertRowId();
          expect(id).toEqual(4);
        })
      );
    });
  });

  describe('Concurrency Handling', function () {
    it('Should support two concurrent connections', function () {
      var dbFilename = Windows.Storage.ApplicationData.current.temporaryFolder.path + "\\concurrencyTest.sqlite";
      var db1, db2;
      SQLite3.Database.enableSharedCache(true);
      waitsForPromise(
        SQLite3JS.openAsync(dbFilename).then(function (db) {
          return db.runAsync("CREATE TABLE IF NOT EXISTS TestData (id INTEGER PRIMARY KEY, value TEXT)")
        }).then(function (db) {
          return db.runAsync("DELETE FROM TestData");
        }).then(function (db) {
          db1 = db;
          return SQLite3JS.openAsync(dbFilename);
        }).then(function (db) {
          db2 = db;
        }).then(function () {
          promises = [];
          for (var i = 0; i < 50; i++) {
            var db = i % 2 ? db1 : db2;
            var promise = db.runAsync("INSERT INTO TestData (value) VALUES (?)", ["Value " + i]);
            promises.push(promise);
          };
          return WinJS.Promise.join(promises);
        }).then(function () {
          return SQLite3JS.openAsync(dbFilename);
        }).then(function (db) {
          return db.oneAsync("SELECT COUNT(*) as rowCount FROM TestData");
        }).then(function (row) {
          expect(row.rowCount).toEqual(50);
        }));
    });
  });

  describe('Error Handling', function () {
    it('should throw when creating an invalid database', function () {
      var thisSpec = this;

      waitsForPromise(
        SQLite3JS.openAsync('invalid path').then(function (db) {
          thisSpec.fail('The error handler was not called.');
        }, function (error) {
          expect(error.resultCode).toEqual(SQLite3.ResultCode.cantOpen);
        })
      );
    });

    it('should throw when executing an invalid statement', function () {
      var thisSpec = this;

      waitsForPromise(
        db.runAsync('invalid sql').then(function () {
          thisSpec.fail('The error handler was not called.');
        }, function (error) {
          expect(error.resultCode).toEqual(SQLite3.ResultCode.error);
        })
      );
    });
  });

  describe('Item Data Source', function () {
    beforeEach(function () {
      this.itemDataSource = db.itemDataSource('SELECT * FROM Item ORDER BY id', 'id');
    });

    it('should support getCount()', function () {
      waitsForPromise(
        this.itemDataSource.getCount().then(function (count) {
          expect(count).toEqual(3);
        })
      );
    });

    it('should support itemFromIndex()', function () {
      waitsForPromise(
        this.itemDataSource.itemFromIndex(1).then(function (item) {
          expect(item.key).toEqual('2');
          expect(item.data.name).toEqual('Orange');
        })
      );
    });
  });

  describe('Group Data Source', function () {
    beforeEach(function () {
      this.groupDataSource = db.groupDataSource(
        'SELECT LENGTH(name) AS key, COUNT(*) AS groupSize FROM Item GROUP BY key',
        'key',
        'groupSize');
    });

    it('should support getCount()', function () {
      waitsForPromise(
        this.groupDataSource.getCount().then(function (count) {
          expect(count).toEqual(2);
        })
      );
    });

    it('should support itemFromIndex()', function () {
      waitsForPromise(
        this.groupDataSource.itemFromIndex(1).then(function (item) {
          expect(item.key).toEqual('6');
          expect(item.groupSize).toEqual(2);
          expect(item.firstItemIndexHint).toEqual(1);
        })
      );
    });

    it('should support itemFromKey()', function () {
      waitsForPromise(
        this.groupDataSource.itemFromKey('5').then(function (item) {
          expect(item.key).toEqual('5');
          expect(item.groupSize).toEqual(1);
          expect(item.firstItemIndexHint).toEqual(0);
        })
      );
    });
  });

  it('should pass JSLint', function () {
    this.addMatchers({
      toPassJsLint: function () {
        var options = {
          white: true,
          nomen: true,
          bitwise: true,
          predef: ['SQLite3', 'WinJS', 'Windows']
        };
        if (JSLINT(this.actual, options)) {
          return true;
        } else {
          var message = document.createElement('div');
          WinJS.Utilities.setInnerHTML(message, JSLINT.report(true));

          this.message = function () {
            return message;
          };
          return false;
        }
      }
    });

    var sourceUri = new Windows.Foundation.Uri('ms-appx:///js/SQLite3.js');

    waitsForPromise(
      Windows.Storage.StorageFile.getFileFromApplicationUriAsync(sourceUri)
        .then(function (file) {
          return Windows.Storage.FileIO.readTextAsync(file)
        })
        .then(function (source) {
          expect(source).toPassJsLint();
        })
    );
  });
});

describe('SQLite3JS', function () {
  function waitsForPromise (promise) {
    var done = false;

    promise.then(function () {
      done = true;
    }, function (error) {
      currentJasmineSpec.fail(error);
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

  it('should return items with names ending on "e"', function () {
    waitsForPromise(
      db.allAsync('SELECT * FROM Item WHERE name LIKE ? ORDER BY id ASC', ['%e'])
        .then(function (rows) {
          expect(rows.length).toEqual(2);
          expect(rows[0].name).toEqual('Apple');
          expect(rows[1].name).toEqual('Orange');
        })
    );
  });

  describe('oneAsync()', function () {
    it('should return null for empty queries', function () {
      waitsForPromise(
        db.oneAsync('SELECT * FROM Item WHERE name = ?', ['BEEF']).then(function (row) {
          expect(row).toBeNull();
        })
      );
    });
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

  it('should call a callback for each row', function () {
    var calls = 0,
        countCall = function () { calls += 1; };

    waitsForPromise(
      db.eachAsync('SELECT * FROM Item', countCall)
        .then(function () {
          expect(calls).toEqual(3);
          calls = 0;
          return db.eachAsync('SELECT * FROM Item WHERE price > ?', [2], countCall);
        })
        .then(function () {
          expect(calls).toEqual(2);
        })
    );
  });

  it('should map a function over all rows', function () {
    waitsForPromise(
      db.mapAsync('SELECT * FROM Item', function (row) {
        return row.price > 2 ? 'expensive' : 'cheap';
      }).then(function (rating) {
        expect(rating.length).toEqual(3);
        expect(rating[0]).toEqual('cheap');
        expect(rating[1]).toEqual('expensive');
        expect(rating[2]).toEqual('expensive');
      })
    );
  });

  describe('Error Handling', function () {
    it('should throw when creating an invalid database', function () {
      waitsForPromise(
        SQLite3JS.openAsync('invalid path').then(function (db) {
          // The complete callback isn't supposed to be called.
          expect(false).toBe(true);
        }, function (error) {
          expect(error.resultCode).toEqual(SQLite3.ResultCode.cantOpen);
        })
      );
    });

    it('should throw when executing an invalid statement', function () {
      waitsForPromise(
        db.runAsync('invalid sql').then(function () {
          // The complete callback isn't supposed to be called.
          expect(false).toBe(true);
        }, function (error) {
          expect(error.resultCode).toEqual(SQLite3.ResultCode.error);
        })
      );
    });
  });

  describe('Item Data Source', function () {
    beforeEach(function () {
      this.itemDataSource = db.itemDataSource('SELECT * FROM Item', 'id');
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
          predef: ['SQLite3', 'WinJS']
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

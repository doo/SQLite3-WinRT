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
    db = new SQLite3JS.Database(':memory:');
    db.run('CREATE TABLE Item (name TEXT, price REAL, id INT PRIMARY KEY)');
    db.run('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Apple', 1.2, 1]);
    db.run('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Orange', 2.5, 2]);
    db.run('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Banana', 3, 3]);
  });

  afterEach(function () {
    db.run('DROP TABLE Item');
    db.close();
  });

  it('should return the correct count', function () {
    var row;

    row = db.one('SELECT COUNT(*) AS count FROM Item');
    return expect(row.count).toEqual(3);
  });

  it('should return an item by id', function () {
    var row;

    row = db.one('SELECT * FROM Item WHERE id = ?', [2]);
    expect(row.name).toEqual('Orange');
    expect(row.price).toEqual(2.5);
    expect(row.id).toEqual(2);
  });

  it('should return items with names ending on "e"', function () {
    var expectedValues, i, properties, property, rows, _i, _len, _ref;

    rows = db.all('SELECT * FROM Item WHERE name LIKE ? ORDER BY id ASC', ['%e']);
    expect(rows.length).toEqual(2);
    expect(rows[0].name).toEqual('Apple');
    expect(rows[1].name).toEqual('Orange');
  });

  it('should allow binding null arguments', function () {
    var row, name = 'Mango';

    db.run('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', [name, null, null]);
    row = db.one('SELECT * FROM Item WHERE name = ?', [name]);
    expect(row.name).toEqual(name);
    expect(row.price).toEqual(null);
    expect(row.id).toEqual(null);
  });

  it('should call a callback for each row', function () {
    var calls, countCall = function () { calls += 1; };

    calls = 0;
    db.each('SELECT * FROM Item', countCall);
    expect(calls).toEqual(3);

    calls = 0;
    db.each('SELECT * FROM Item WHERE price > ?', [2], countCall);
    expect(calls).toEqual(2);
  });

  it('should map a function over all rows', function () {
    var rating = db.map('SELECT * FROM Item', function (row) {
      return row.price > 2 ? 'expensive' : 'cheap';
    });

    expect(rating.length).toEqual(3);
    expect(rating[0]).toEqual('cheap');
    expect(rating[1]).toEqual('expensive');
    expect(rating[2]).toEqual('expensive');
  });

  describe('Error Handling', function () {
    beforeEach(function () {
      this.addMatchers({
        toThrowWithResultCode: function (expected) {
          try {
            this.actual();
            return false;
          } catch (error) {
            return error.resultCode === expected;
          }
        }
      });
    });

    it('should throw when creating an invalid database', function () {
      expect(function () {
        new SQLite3JS.Database('invalid path');
      }).toThrowWithResultCode(SQLite3.ResultCode.cantOpen);
    });

    it('should throw when executing an invalid statement', function () {
      expect(function () {
        db.run('invalid sql');
      }).toThrowWithResultCode(SQLite3.ResultCode.error);
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

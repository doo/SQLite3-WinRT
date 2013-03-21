(function () {
  "use strict";

  function require(path) {
    var element = document.createElement("script");
    element.src = path;
    console.info("Require script " + element.src);
    document.head.appendChild(element);
  }

  NodeList.prototype.forEach = Array.prototype.forEach;

  function isPartOfSuite(suite, name) {
    if (!suite) {
      return false;
    }
    if (suite.description === name) {
      return true;
    }
    if (suite.getFullName() === name) {
      return true;
    }
    return isPartOfSuite(suite.parentSuite, name);
  }

  function async(testFunc, timeout, message) {
    var done, testFuncPromise;
    done = false;
    if (testFunc.then && typeof testFunc.then === "function") {
      testFuncPromise = testFunc;
    } else {
      testFuncPromise = new WinJS.Promise(function (complete) {
        return complete(testFunc());
      });
    }
    testFuncPromise.done(function () {
      done = true;
    }, function (error) {
      jasmine.getEnv().currentSpec.fail(error.message);
      done = true;
    });
    return waitsFor(function () {
      return done;
    }, message, timeout);
  }

  function lintFileAsync(file, predefines) {
    var options = {
      white: true,
      nomen: true,
      bitwise: true,
      predef: [
        "JSLINT", "window", 'WinJS', 'Windows', 'console', 'document', 'setImmediate'
      ].concat(predefines || [])
    };
    return Windows.Storage.PathIO.readTextAsync(file).then(function fileRead(fileContent) {
      if (!JSLINT(fileContent, options)) {
        var error, message = "The file " + file + " contains the following errors:\n";
        message += JSLINT.errors.map(function format(error) {
          if (error) {
            return error.reason + " at line " + error.line + ", column " + error.character;
          } 
          return "JSLint gave up";
        }).join("\n");
        error = new WinJS.ErrorFromName("JSLintError", message);
        error.errors = JSLINT.errors;
        error.htmlReport = JSLINT.report(true);
        throw error;
      }
    });
  }

  WinJS.Namespace.define("spec", {
    async: async,
    lintFileAsync: lintFileAsync,
    require: require,
    config: {}
  });

  function loadSpecsAsync() {
    return Windows.ApplicationModel.Package.current.installedLocation.getFolderAsync("spec").then(function gotFolder(folder) {
      var queryOptions = new Windows.Storage.Search.QueryOptions(Windows.Storage.Search.CommonFileQuery.orderByName, [".js"]),
          query = folder.createFileQueryWithOptions(queryOptions);
      return query.getFilesAsync().then(function (files) {
        files.forEach(function (file) {
          var element = document.createElement("script");
          element.src = "/spec/" + file.name;
          console.info("Loading spec " + element.src);
          document.head.appendChild(element);
        });
      });
    });
  }

  describe("JSLint", function () {
    it("should evaluate all javascript code just fine", function () {
      var jsLintPredefines = ["require", "spec", 'jasmine', 'describe', 'xdescribe', 'it', 'xit', 'beforeEach', 'afterEach',
          'expect', 'runs', "waitsFor"].concat(spec.config.jslintPredefines || []),
          completePromise = WinJS.Promise.as();
      document.head.querySelectorAll("script:not([data-jslint=false])").forEach(function (scriptElement) {
        console.info("JSLinting " + scriptElement.src);
        var predefines = (scriptElement.getAttribute("data-jslint-predefines") || "").split(/[ ,]+/);
        async(lintFileAsync(scriptElement.src, jsLintPredefines.concat(predefines)));
      });
    });
  });

  document.addEventListener("DOMContentLoaded", function (event) {
    WinJS.Application.queueEvent({ type: "run" });
  });

  WinJS.Application.addEventListener("run", function (event) {
    event.setPromise(loadSpecsAsync().then(function specsLoaded() {
      var env = jasmine.getEnv(),
          htmlReporter, oldSpecFilter;
      
      htmlReporter = new jasmine.HtmlReporter();
      htmlReporter.logRunningSpecs = true;
      env.addReporter(htmlReporter);
        
      env.specFilter = function (spec) {
        return htmlReporter.specFilter(spec);
      };

      if (spec.config.junitReport) {
        env.addReporter(new jasmine.JUnitXmlReporter("testResults"));
      }
      
      if (spec.config && spec.config.suitesToRun && spec.config.suitesToRun.length > 0) {
        if (spec.config.suitesToRun.length === 1) {
          if (spec.config.suitesToRun[0] === "") {
            delete spec.config.suitesToRun;
          }
        }
        if (spec.config.suitesToRun && spec.config.suitesToRun.length > 0) {
          oldSpecFilter = htmlReporter.specFilter;
          htmlReporter.specFilter = function(_spec) {
            var specSuiteFilter;
            specSuiteFilter = function(_spec) {
              return spec.config.suitesToRun.some(isPartOfSuite.bind(this, _spec.suite));
            };
            return oldSpecFilter.call(this, _spec) && specSuiteFilter(_spec);
          };
          jasmine.getEnv().specFilter = function(_spec) {
            return htmlReporter.specFilter(_spec);
          };
        }
      }
      if (spec.config.quitAfterTests) {
        WinJS.Application.addEventListener('jasmine.junitreporter.complete', function() {
          return window.close();
        });
      }
      jasmine.getEnv().execute();
    }));
  });
  
  WinJS.Application.start();
}());
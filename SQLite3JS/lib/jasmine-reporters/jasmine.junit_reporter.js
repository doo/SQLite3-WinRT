(function () {
  "use strict";
  if (!jasmine) {
    throw new Error("jasmine library does not exist in global namespace!");
  }

  function elapsed(startTime, endTime) {
    return (endTime - startTime) / 1000;
  }

  function getISODateString(d) {
    if (!d) {
      return "";
    }

    function pad(n) { return n < 10 ? '0' + n : n; }

    return d.getFullYear() + '-' +
        pad(d.getMonth() + 1) + '-' +
        pad(d.getDate()) + 'T' +
        pad(d.getHours()) + ':' +
        pad(d.getMinutes()) + ':' +
        pad(d.getSeconds());
  }

  function trim(str) {
    return str.replace(/^\s+/, "").replace(/\s+$/, "");
  }

  function escapeInvalidXmlChars(str) {
    return str.replace(/\&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/\>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/\'/g, "&apos;");
  }

  if (!jasmine.Suite.prototype.getDuration) {
    jasmine.Suite.prototype.getDuration = function () {
      var suiteDuration = 0;
      this.specs().forEach(function (spec) {
        if (!isNaN(spec.duration)) {
          suiteDuration += spec.duration;
        }
      });
      this.suites().forEach(function (suite) {
        var innerDuration = suite.getDuration();
        if (!isNaN(innerDuration)) {
          suiteDuration += innerDuration;
        }
      });
      return suiteDuration;
    };
  }
  /**
   * Generates JUnit XML for the given spec run.
   * Allows the test results to be used in java based CI
   * systems like CruiseControl and Hudson.
   *
   * @param {string} savePath where to save the files
   * @param {boolean} consolidate whether to save nested describes within the
   *                  same file as their parent; default: true
   * @param {boolean} useDotNotation whether to separate suite names with
   *                  dots rather than spaces (ie "Class.init" not
   *                  "Class init"); default: true
   */
  var JUnitXmlReporter = function (savePath, consolidate, useDotNotation) {
    this.savePath = savePath || '';
    this.consolidate = consolidate === jasmine["undefined"] ? true : consolidate;
    this.useDotNotation = useDotNotation === jasmine["undefined"] ? true : useDotNotation;
  };
  JUnitXmlReporter.finished_at = null; // will be updated after all files have been written

  JUnitXmlReporter.prototype = {
    reportSpecStarting: function (spec) {
      spec.startTime = new Date();

      if (!spec.suite.startTime) {
        spec.suite.startTime = spec.startTime;
      }
    },

    reportSpecResults: function (spec) {
      var results = spec.results(), failure = "", failures = 0;
      spec.didFail = !results.passed();
      spec.duration = elapsed(spec.startTime, new Date());
      spec.output = '<testcase classname="' + this.getFullName(spec.suite) +
          '" name="' + escapeInvalidXmlChars(spec.description) + '" time="' + spec.duration + '">';

      results.getItems().forEach(function (result) {
        if (result.type === 'expect' && result.passed && !result.passed()) {
          failures += 1;
          failure += (failures + ": " + escapeInvalidXmlChars(result.message) + " ");
        }
      });
      if (failure) {
        spec.output += "<failure>" + trim(failure) + "</failure>";
      }
      spec.output += "</testcase>";
    },

    reportSuiteResults: function (suite) {
      var results = suite.results(),
          specs = suite.specs(),
          specOutput = "",
          // for JUnit results, let's only include directly failed tests (not nested suites')
          failedCount = 0;

      suite.status = results.passed() ? 'Passed.' : 'Failed.';
      if (results.totalCount === 0 || results.skipped) { // todo: change this to check results.skipped
        suite.status = 'Skipped.';
      }

      specs.forEach(function (spec) {
        failedCount += spec.didFail ? 1 : 0;
        specOutput += "\n  " + spec.output;
      });
      suite.output = '\n<testsuite name="' + this.getFullName(suite) +
          '" errors="0" tests="' + specs.length + '" failures="' + failedCount +
          '" time="' + suite.getDuration() + '" timestamp="' + getISODateString(suite.startTime) + '">';
      suite.output += specOutput;
      suite.output += "\n</testsuite>";
    },

    reportRunnerResults: function (runner) {
      var suites = runner.suites(),
          winJSPromises = [],
          that = this;
      suites.forEach(function(suite) {
        var fileName = 'TEST-' + that.getFullName(suite, true) + '.xml',
            output = '<?xml version="1.0" encoding="UTF-8" ?>';
        // if we are consolidating, only write out top-level suites
        if (that.consolidate && suite.parentSuite) {
          output += ""; // shut up jslint
        } else if (that.consolidate) {
          output += "\n<testsuites>";
          output += that.getNestedOutput(suite);
          output += "\n</testsuites>";
          winJSPromises.push(that.writeFile(that.savePath + fileName, output));
        } else {
          output += suite.output;
          winJSPromises.push(that.writeFile(that.savePath + fileName, output));
        }
      });
      if (winJSPromises.length > 0) {
        WinJS.Promise.join(winJSPromises).then(function () {
          WinJS.Application.queueEvent({ type: 'jasmine.junitreporter.complete' });
        });
      }
      // When all done, make it known on JUnitXmlReporter
      JUnitXmlReporter.finished_at = (new Date()).getTime();
    },

    getNestedOutput: function (suite) {
      var output = suite.output,
          that = this;
      suite.suites().forEach(function(_suite) {
        output += that.getNestedOutput(_suite);
      });
      return output;
    },

    writeFile: function (filename, text) {
      // WinJS
      var simpleFilename = filename.substr(this.savePath.length),
          fileWriteDone = false;
      return Windows.Storage.ApplicationData.current.localFolder.createFolderAsync(this.savePath, Windows.Storage.CreationCollisionOption.openIfExists).then(function (folder) {
        return folder.createFileAsync(simpleFilename, Windows.Storage.CreationCollisionOption.replaceExisting).then(function (storageFile) {
          return Windows.Storage.FileIO.writeTextAsync(storageFile, text);
        });
      });
    },

    getFullName: function (suite, isFilename) {
      var fullName, parentSuite;
      if (this.useDotNotation) {
        fullName = suite.description;
        for (parentSuite = suite.parentSuite; parentSuite; parentSuite = parentSuite.parentSuite) {
          fullName = parentSuite.description + '.' + fullName;
        }
      }
      else {
        fullName = suite.getFullName();
      }

      // Either remove or escape invalid XML characters
      if (isFilename) {
        return fullName.replace(/[^\w]/g, "");
      }
      return escapeInvalidXmlChars(fullName);
    },

    log: function (str) {
      var console = jasmine.getGlobal().console;

      if (console && console.log) {
        console.log(str);
      }
    }
  };

  // export public
  jasmine.JUnitXmlReporter = JUnitXmlReporter;
}());

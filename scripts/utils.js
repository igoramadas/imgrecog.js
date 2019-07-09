// Generated by CoffeeScript 2.4.1
(function() {
  // Common utilities to be used within scripts.
  var Utils, fs, path;

  fs = require("fs");

  path = require("path");

  Utils = {
    // Returns a object filenames as keys and tags as value objects.
    // -------------------------------------------------------------------------
    getFolderTags: function(folder) {
      var ex, file, files, i, key, len, result, tags, tagsfile, value;
      result = {};
      files = fs.readdirSync(folder);
      for (i = 0, len = files.length; i < len; i++) {
        file = files[i];
        if (path.extname(file) === ".tags") {
          try {
            tagsfile = file.substring(0, file.lastIndexOf(".tags"));
            tagsfile = path.join(folder, file);
            tags = fs.readFileSync(tagsfile, "utf8");
            tags = JSON.parse(tags);
            for (key in tags) {
              value = tags[key];
              // Make sure all scores are float!
              tags[key] = parseFloat(value);
            }
            result[tagsfile] = tags;
          } catch (error) {
            ex = error;
            console.error(tagsfile, ex);
          }
        }
      }
      return result;
    }
  };

  module.exports = Utils;

}).call(this);

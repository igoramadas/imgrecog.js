(function() {
  //####################################################################
  //#################################################################
  /* IMGRecog.js
  */
  var apiResult, asyncLib, client, counter, currentFolder, executableFolder, fileQueue, finishedQueue, folders, fs, getParams, getScripts, homeFolder, likelyhood, options, os, path, queueProcessor, run, scanFile, scanFolder, scripts, showHelp, startTime, vision;

  asyncLib = require("async");

  fs = require("fs");

  os = require("os");

  path = require("path");

  vision = require("@google-cloud/vision");

  client = null;

  // Get current and bin executable folder.
  currentFolder = process.cwd() + "/";

  homeFolder = os.homedir() + "/";

  executableFolder = path.dirname(require.main.filename) + "/";

  // Collection of folders to scan.
  folders = [];

  // Collection of available scripts.
  scripts = {};

  // File scan count.
  counter = 0;

  // Create file processor queue  to parse files against Google Vision.
  queueProcessor = function(filepath, callback) {
    return scanFile(filepath, callback);
  };

  fileQueue = asyncLib.queue(queueProcessor, 4);

  // File processor queue will drain once we have processed all files.
  fileQueue.drain = function() {
    return finishedQueue();
  };

  // Default options.
  options = {
    decimals: 2,
    extensions: ["png", "jpg", "jpeg", "gif", "bpm", "raw", "webp"],
    limit: 1000,
    overwrite: false,
    verbose: false,
    // Below are the available identification commands.
    labels: false,
    landmarks: false,
    logos: false,
    safe: false,
    // Scripts to run after processing.
    scripts: []
  };

  // Transforms safe search strings to scores.
  likelyhood = {
    VERY_UNLIKELY: 0.05,
    UNLIKELY: 0.25,
    POSSIBLE: 0.55,
    LIKELY: 0.75,
    VERY_LIKELY: 0.95
  };

  // Set start time (Unix timestamp).
  startTime = Date.now();

  // Show help on command line (imgrecog.js -help).
  showHelp = function() {
    console.log("imgrecog.js <options> <folders>");
    console.log("");
    console.log("  -labels            detect labels");
    console.log("  -landmarks         detect landmarks");
    console.log("  -logos             detect logos");
    console.log("  -safe              detect safe search");
    console.log("  -all               detect all (same as enabling everything above)");
    console.log("  -overwrite   -w    reprocess existing files / overwrite tags");
    console.log("  -verbose     -v    enable verbose");
    console.log("  -help        -h    help me (this screen)");
    console.log("");
    console.log(".............................................................................");
    console.log("");
    console.log("Examples:");
    console.log("");
    console.log("Detect labels and safe search on current directory");
    console.log("  $ imgrecog.js -labels -safe");
    console.log("");
    console.log("Detect everything and overwrite tags on specific directories");
    console.log("  $ imgrecog.js -all -w /home/someuser/images /home/someuser/photos");
    console.log("");
    console.log(".............................................................................");
    console.log("");
    console.log("The Google Vision API credentials must be set on a imgrecog.auth.json file.");
    console.log("If you wish to change the tool options, create a imgrecog.config.json file.");
    console.log("Current options:");
    console.log("");
    console.log(`  decimals (${options.decimals})`);
    console.log(`  extensions (${options.extensions.join(' ')})`);
    console.log(`  limit (${options.limit})`);
    console.log(`  overwrite (${options.overwrite})`);
    console.log(`  verbose (${options.verbose})`);
    console.log("");
    console.log("#############################################################################");
    return console.log("");
  };

  // Load scripts from /scripts folder.
  getScripts = function() {
    var filename, files, j, len, results, s, scriptsPath;
    scriptsPath = path.join(__dirname, "scripts");
    files = fs.readdirSync(scriptsPath);
    results = [];
    for (j = 0, len = files.length; j < len; j++) {
      s = files[j];
      if (path.extname(s) === ".js") {
        filename = s.substring(0, s.lastIndexOf(".js"));
        results.push(scripts[filename] = require(`./scripts/${s}`));
      } else {
        results.push(void 0);
      }
    }
    return results;
  };

  // Get parameters from command line.
  getParams = function() {
    var f, filename, j, k, len, len1, p, params;
    params = Array.prototype.slice.call(process.argv, 2);
    // No parameters? Show help.
    if (params.length === 0) {
      showHelp();
      return process.exit(0);
    }
// Parse parameters...
    for (j = 0, len = params.length; j < len; j++) {
      p = params[j];
      switch (p) {
        case "-help":
          showHelp();
          return process.exit(0);
        case "-v":
        case "-verbose":
          options.verbose = true;
          break;
        case "-w":
        case "-overwrite":
          options.overwrite = true;
          break;
        case "-all":
          options.labels = true;
          options.landmarks = true;
          options.logos = true;
          options.safe = true;
          break;
        case "-labels":
          options.labels = true;
          break;
        case "-landmarks":
          options.landmarks = true;
          break;
        case "-logos":
          options.logos = true;
          break;
        case "-safe":
          options.safe = true;
          break;
        default:
          filename = p.substring(1);
          if (scripts[filename] != null) {
            options.scripts.push(filename);
          } else {
            folders.push(p);
          }
      }
    }
    // If no folders were passed, search on current directory.
    if (folders.length < 1) {
      folders.push(currentFolder);
    }
    for (k = 0, len1 = folders.length; k < len1; k++) {
      f = folders[k];
      if (f.substring(0, 1) === "-") {
        console.log(`Abort! Invalid option: ${f}. Use -help to get a list of available options.`);
        console.log("");
        return process.exit(0);
      }
    }
  };

  // Call the Vision API and return result so we can process tags.
  apiResult = function(filepath, method, key) {
    return new Promise(async function(resolve, reject) {
      var ex, result;
      try {
        result = (await method(filepath));
        return resolve(result[0][key]);
      } catch (error) {
        ex = error;
        return reject(ex);
      }
    });
  };

  // Scan and process image file.
  scanFile = async function(filepath, callback) {
    var ex, exists, j, k, key, l, label, land, len, len1, len2, len3, logo, logtext, m, outputData, outputPath, r, ref, result, score, tags, value;
    outputPath = filepath + ".tags";
    tags = {};
    // File was processed before?
    exists = fs.existsSync(outputPath);
    if (exists) {
      if (options.overwrite) {
        if (options.verbose) {
          console.log(filepath, "already processed, overwrite");
        }
      } else {
        if (options.verbose) {
          console.log(filepath, "already processed, skip");
        }
        return callback();
      }
    }
    // Increase scan counter.
    counter++;
    if (counter === options.limit) {
      console.log(`Limit ${counter} reached! Will NOT process more files...`);
      return callback();
    } else if (counter > options.limit) {
      return callback();
    }
    // Detect labels?
    if (options.labels) {
      try {
        result = (await apiResult(filepath, client.labelDetection, "labelAnnotations"));
        logtext = [];
// Add labels as tags.
        for (j = 0, len = result.length; j < len; j++) {
          label = result[j];
          score = label.score.toFixed(options.decimals);
          logtext.push(`${label.description}:${score}`);
          tags[label.description] = score;
        }
        if (options.verbose && logtext.length > 0) {
          console.log(filepath, "labels", logtext.join(", "));
        }
      } catch (error) {
        ex = error;
        console.error(filepath, "labels", ex);
      }
    }
    // Detect landmarks?
    if (options.landmarks) {
      try {
        result = (await apiResult(filepath, client.landmarkDetection, "landmarkAnnotations"));
        logtext = [];
// Add landmarks as tags.
        for (k = 0, len1 = result.length; k < len1; k++) {
          r = result[k];
          if (r.landmarks) {
            ref = r.landmarks;
            for (l = 0, len2 = ref.length; l < len2; l++) {
              land = ref[l];
              score = land.score.toFixed(options.decimals);
              logtext.push(`${land.description}:${score}`);
              tags[land.description] = score;
            }
          }
        }
        if (options.verbose && logtext.length > 0) {
          console.log(filepath, "landmarks", logtext.join(", "));
        }
      } catch (error) {
        ex = error;
        console.error(filepath, "landmarks", ex);
      }
    }
    // Detect logos?
    if (options.logos) {
      try {
        result = (await apiResult(filepath, client.logoDetection, "logoAnnotations"));
        logtext = [];
// Add logos as tags.
        for (m = 0, len3 = result.length; m < len3; m++) {
          logo = result[m];
          score = logo.score.toFixed(options.decimals);
          logtext.push(`${logo.description}:${score}`);
          tags[logo.description] = score;
        }
        if (options.verbose && logtext.length > 0) {
          console.log(filepath, "logos", logtext.join(", "));
        }
      } catch (error) {
        ex = error;
        console.error(filepath, "logos", ex);
      }
    }
    // Detect safe search?
    if (options.safe) {
      try {
        result = (await apiResult(filepath, client.safeSearchDetection, "safeSearchAnnotation"));
        logtext = [];
// Add safe search labels as tags.
        for (key in result) {
          value = result[key];
          score = likelyhood[value];
          logtext.push(`${key}:${score}`);
          tags[key] = score;
        }
        if (options.verbose && logtext.length > 0) {
          console.log(filepath, "safe", logtext.join(", "));
        }
      } catch (error) {
        ex = error;
        console.error(filepath, "safe", ex);
      }
    }
    // Output data to JSON.
    outputData = JSON.stringify(tags, null, 2);
    try {
      // Write results to .json file.
      return fs.writeFile(outputPath, outputData, function(err) {
        if (err != null) {
          console.error(filepath, "write file", err);
        } else {
          console.log(filepath, `processed ${(Object.keys(tags).length)} tags`);
        }
        return callback(err);
      });
    } catch (error) {
      ex = error;
      console.error(filepath, "write file", ex);
      return callback(ex);
    }
  };

  // Scan a folder to match duplicates.
  scanFolder = function(folder, callback) {
    var contents, ex, i, scanner;
    if (options.verbose) {
      console.log("");
      console.log(`Scanning ${folder} ...`);
    }
    // Helper to scan folder contents (directories and files).
    scanner = function(file) {
      var ex, ext, filepath, stats;
      filepath = path.join(folder, file);
      ext = path.extname(filepath).toLowerCase().replace(".", "");
      try {
        stats = fs.statSync(filepath);
        if (stats.isDirectory()) {
          return scanFolder(filepath);
        } else {
          if (options.extensions.indexOf(ext) >= 0) {
            if (counter < options.limit) {
              return fileQueue.push(filepath);
            }
          } else if (options.verbose) {
            return console.log(filepath, "extensions not included, skip");
          }
        }
      } catch (error) {
        ex = error;
        return console.error(`Error reading ${filepath}: ${ex}`);
      }
    };
    if (!path.isAbsolute(folder)) {
      // Make sure we have the correct folder path.
      folder = executableFolder + folder;
    }
    try {
      contents = fs.readdirSync(folder);
      if (options.verbose) {
        console.log(`${folder} has ${contents.length} itens`);
      }
      i = 0;
      while (i < contents.length) {
        scanner(contents[i]);
        i++;
      }
      if (callback != null) {
        return callback(null);
      }
    } catch (error) {
      ex = error;
      console.error(`Error reading ${folder}: ${ex}`);
      if (callback != null) {
        return callback(ex);
      }
    }
  };

  // Finished processing file queue.
  finishedQueue = async function(err, result) {
    var duration, j, len, ref, s, scriptResult;
    duration = (Date.now() - startTime) / 1000;
    console.log("");
    console.log(`Finished processing images after ${duration} seconds`);
    if (options.scripts.length > 0) {
      ref = options.scripts;
      for (j = 0, len = ref.length; j < len; j++) {
        s = ref[j];
        console.log("");
        console.log(`Running script ${s}`);
        scriptResult = (await scripts[s](folders));
      }
      console.log("");
      console.log("Finished running scripts");
    }
    // Bye!
    return console.log("");
  };

  // Run it!
  run = function() {
    var arr, configCurrent, configExecutable, configHome, configJson, configPath, credentialsCurrent, credentialsExecutable, credentialsHome, ex, folder, folderTasks, j, key, len, value;
    console.log("");
    console.log("#############################################################################");
    console.log("# IMGRecog.js");
    console.log("#############################################################################");
    console.log("");
    // Get valid filenames for the configuration and key files.
    configExecutable = path.join(currentFolder, "imgrecog.config.json");
    configHome = path.join(currentFolder, "imgrecog.config.json");
    configCurrent = path.join(currentFolder, "imgrecog.config.json");
    credentialsExecutable = path.join(executableFolder, "imgrecog.auth.json");
    credentialsHome = path.join(homeFolder, "imgrecog.auth.json");
    credentialsCurrent = path.join(currentFolder, "imgrecog.auth.json");
    try {
      // Load options from config file?
      if (fs.existsSync(configCurrent)) {
        configPath = configCurrent;
      } else if (fs.existsSync(configHome)) {
        configPath = configHome;
      } else if (fs.existsSync(configExecutable)) {
        configPath = configExecutable;
      }
      if (configPath != null) {
        console.log(`Using config from ${configPath}`);
        console.log("");
        configJson = fs.readFileSync(configPath, "utf8");
        configJson = JSON.parse(configJson);
        for (key in configJson) {
          value = configJson[key];
          options[key] = value;
        }
      }
    } catch (error) {
      ex = error;
      console.error(`Can't load ${configPath}`, ex);
      console.log("");
    }
    // Load available scripts.
    getScripts();
    // Get the passed parameters. If -help, it will end here.
    getParams();
    // Passed options.
    arr = [];
    for (key in options) {
      value = options[key];
      arr.push(`${key}: ${value}`);
    }
    console.log(`Options: ${arr.join(" | ")}`);
    // Create client, checking if a credentials.json file exists.
    // Only if any of the identification commmands was passed.
    if (options.labels || options.landmarks || options.logos || options.safe) {
      try {
        if (fs.existsSync(credentialsCurrent)) {
          client = new vision.ImageAnnotatorClient({
            keyFilename: credentialsCurrent
          });
          console.log(`Using credentials from ${credentialsCurrent}`);
        } else if (fs.existsSync(credentialsHome)) {
          client = new vision.ImageAnnotatorClient({
            keyFilename: credentialsHome
          });
          console.log(`Using credentials from ${credentialsHome}`);
        } else if (fs.existsSync(credentialsExecutable)) {
          client = new vision.ImageAnnotatorClient({
            keyFilename: credentialsExecutable
          });
          console.log(`Using credentials from ${credentialsExecutable}`);
        } else {
          client = new vision.ImageAnnotatorClient();
          console.log("Using credentials from environment variables");
        }
      } catch (error) {
        ex = error;
        console.error("Could not create a Vision API client, make sure you have defined credentials on a imgrecog.json file or environment variables.", ex);
      }
      console.log("");
      folderTasks = [];
// Iterate and scan search folders.
      for (j = 0, len = folders.length; j < len; j++) {
        folder = folders[j];
        console.log(folder);
        (function(folder) {
          return folderTasks.push(function(callback) {
            return scanFolder(folder, callback);
          });
        })(folder);
      }
      console.log("");
      // Run folder scanning tasks in parallel.
      return asyncLib.parallelLimit(folderTasks, 2);
    } else {
      return finishedQueue();
    }
  };

  // Unhandled rejections goes here.
  process.on("unhandledRejection", function(reason, p) {
    if (options.verbose) {
      console.log("ERROR!");
      console.log(reason);
    } else {
      console.log("ERROR!", reason.message || reason.code || reason);
    }
    console.log("");
    return process.exit(0);
  });

  // Run baby run!
  // -----------------------------------------------------------------------------
  run();

}).call(this);

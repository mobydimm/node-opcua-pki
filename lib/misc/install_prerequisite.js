/* eslint nzw-cap: 0*/
// ---------------------------------------------------------------------------------------------------------------------
// node-opcua
// ---------------------------------------------------------------------------------------------------------------------
// Copyright (c) 2014-2015 - Etienne Rossignon - etienne.rossignon (at) gadz.org
// ---------------------------------------------------------------------------------------------------------------------
//
// This  project is licensed under the terms of the MIT license.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so,  subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
// Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// ---------------------------------------------------------------------------------------------------------------------
"use strict";

var child_process = require("child_process");
var byline = require('byline');
var fs = require("fs");
var path = require("path");
var yauzl = require("yauzl");
var os = require("os");

require("colors");

function execute(cmd, callback, cwd) {

    var output = "";

    cwd = cwd ? {cwd: cwd} : {};

    var child = child_process.exec(cmd, cwd, function (err) {
        //xx console.log("status = ", child.exitCode);
        callback(err, child.exitCode, output);
    });
    var stream1 = byline(child.stdout);
    stream1.on('data', function (line) {
        output += line + "\n";
        process.stdout.write("        stdout " + line.yellow + "\n");
    });
}

function quote(str) {
    return "\"" + str.replace(/\\/g,"/") + "\"";
}

var download_folder = path.join(os.tmpdir(),".");
var openssl_folder = path.join(__dirname,"../../bin/openssl");
var cwd = openssl_folder;
var openssl_exe_path= path.join(openssl_folder,"openssl.exe");

var quoted_cmd = quote(openssl_exe_path);


function check_openssl(callback) {

    console.log("checking presence of ", openssl_exe_path);
    if (!fs.existsSync(openssl_exe_path)) {
        return callback(null, false);
    }
    execute(quoted_cmd + " version", function (err, exitCode, output) {
        if (err) {
            return callback(err);
        }
        callback(null, (exitCode === 0) && output.match(/1.0.2/));
    }, cwd);
}

var ProgressBar = require('progress');
var wget = require("wget-improved");

/**
 * detect whether windows OS is a 64 bits or 32 bits
 * http://ss64.com/nt/syntax-64bit.html
 * http://blogs.msdn.com/b/david.wang/archive/2006/03/26/howto-detect-process-bitness.aspx
 * @return {number}
 */
function win32or64() {
    //xx  console.log(" process.env.PROCESSOR_ARCHITEW6432  =", process.env.PROCESSOR_ARCHITEW6432);
    if (process.env.PROCESSOR_ARCHITECTURE === "x86" && process.env.PROCESSOR_ARCHITEW6432) {
        return 64;
    }

    if (process.env.PROCESSOR_ARCHITECTURE === "AMD64" ) {
        return 64;
    }

    // check if we are running nodejs x32 on a x64 arch
    if (process.env.CURRENT_CPU === "x64") {
        return 64;
    }
    return 32;
}
function download_openssl(callback) {

    var url = (win32or64() === 64 )
            ? "http://indy.fulgan.com/SSL/openssl-1.0.2j-x64_86-win64.zip"
            : "http://indy.fulgan.com/SSL/openssl-1.0.2j-i386-win32.zip"
        ;


    // the zip file
    var output_filename = path.join(download_folder,path.basename(url));

    console.log("downloading " + url.yellow);
    if (fs.existsSync(output_filename)) {
        return callback(null, output_filename);
    }
    var options = {};
    var bar = new ProgressBar("[:bar]".cyan + " :percent ".yellow + ':etas'.white, {
        complete: '=',
        incomplete: ' ',
        width: 100,
        total: 100
    });

    var download = wget.download(url, output_filename, options);
    download.on('error', function (err) {
        console.log(err);
    });
    download.on('end', function (output) {
        console.log(output);
        console.log("done ...");
        callback(null, output_filename);
    });
    download.on('progress', function (progress) {
        bar.update(progress);
    });
}




function install_openssl(zipfilename, callback) {

  yauzl.open(zipfilename, {lazyEntries: true}, function(err, zipfile) {

     if (err) throw err;

     zipfile.readEntry();

     zipfile.on("end",function(err) {

       console.log("unzip done");
       callback(err);
     });

     zipfile.on("entry", function(entry) {

          zipfile.openReadStream(entry, function(err, readStream) {
             if (err) throw err;

             var file = path.join(openssl_folder,entry.fileName);

             console.log(" unzipping :",file);

            var f = fs.createWriteStream(file);
             // ensure parent directory exists
             readStream.pipe(f);
             readStream.on("end", function() {
                 zipfile.readEntry();
                 f.close();
             });
           });
      });
  });
}

exports.install_prerequisite = function (callback) {


    if (process.platform !== 'win32') {

        execute("which openssl", function (err, exitCode, output) {
            if (err) {
                console.log("warning: ", err.message);
            }
            if (exitCode !== 0) {
                console.log(" it seems that ".yellow + "openssl".cyan + " is not installed on your computer ".yellow);
                console.log("Please install it before running this programs".yellow);
                return callback(new Error("Cannot find openssl"));
            }
            return callback(null, output);
        });

    } else {

      if (!fs.existsSync(openssl_folder)) {
        console.log("creating openssl_folder",openssl_folder);
        fs.mkdirSync(openssl_folder);
      }


        check_openssl(function (err, openssl_ok) {

            if (err) {
                return callback(err);
            }
            if (!openssl_ok) {
                console.log("openssl seems to be missing and need to be installed".yellow);
                download_openssl(function (err, filename) {
                    if (!err) {
                        console.log("deflating ", filename.yellow);
                        install_openssl(filename, function (err) {
                            var openssl_exists = !!fs.existsSync(openssl_exe_path) ;
                            console.log("verifying ",openssl_exists,openssl_exists? "OK ".green : " Error".red, openssl_exe_path);
                            setTimeout(function() {
                              console.log("done ", err ? err : "");
                              check_openssl(function() {
                                callback(err);
                              })
                            },2000); // short break to let the anti-virus check the file
                        });
                    }
                });

            } else {
                console.log("openssl is already installed and have the expected version.".green);
                return callback(null);
            }
        });
    }
};
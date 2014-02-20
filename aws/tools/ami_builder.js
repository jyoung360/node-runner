var https = require('https');
var create = require('./create_ami');
var prompt = require('prompt');
var async = require('async');

var accessTokens = require('./access_tokens.js');

console.log(accessTokens);

var getCommits = function(repoPath,callback) {
	var options = {
		hostname: 'api.github.com',
		port: 443,
		path: repoPath,
		method: 'GET',
		headers: { 'User-Agent':'jyoung360'}
	};

	var json = '';
	var req = https.request(options, function(res) {
		res.on('data', function(d) {
			json += d;
		});
		res.on('end', function() {
			var repo = JSON.parse(json);
			callback(null,repo);
		});
	});
	req.end();

	req.on('error', function(e) {
		return callback(e);
	});
}

var getConfigFiles = function(callback) {
	var obj = [
		{"filename" : "asymptomatic-service/cloudformation/base_ami.json"},
		{"filename" : "myapp/cloudformation/base_ami.json"},
		{"filename" : "express/cloudformation/base_ami.json"}
	];

	return callback(null, obj);
}

var getRepos = function(userPath, callback) {
	var options = {
		hostname: 'api.github.com',
		port: 443,
		path: userPath,
		method: 'GET',
		headers: { 
			'User-Agent':'jyoung360'
		}
	};

	var json = '';
	var req = https.request(options, function(res) {

		res.on('data', function(d) {
			json += d;
		});
		res.on('end', function() {
			var repos = JSON.parse(json);
			return callback(null,repos);
		});
	});
	req.end();

	req.on('error', function(e) {
	  return callback(e);
	});
}

var username;
var repoName;
var SHA;
var configFile;

prompt.start();
prompt.message = "";
prompt.delimiter = "";

async.waterfall([
		function(callback) {
			prompt.get([{
				description: 'Enter a github username'.cyan,
				type: 'string',
				pattern: /^\w+$/,
				default: 'jyoung360',
				required: true
			}], callback);
		},
		function(result,callback) {
			username = result.question;
			if(!accessTokens[username]) { return callback('No access token for username: '+username); }
			getRepos('/user/repos?access_token='+accessTokens[username],callback);
		},
		function(repos, callback){
			for(var i in repos) {
				console.log('%s) %s',i,repos[i].name);
			}
			prompt.get([{
				description: 'Select a repo'.cyan,
				type: 'string',
				pattern: /^\w+$/,
				required: true
			}], function(err,result) {
				if(err) { return callback(err); }
				repoName = repos[result.question].name;
				return callback(null)
			});
		},
		function(callback){
			getCommits('/repos/'+username+'/'+repoName+'/commits?access_token='+accessTokens[username],callback);
		},
		function(commits, callback){
			for(var i in commits) {
				var message = (i == 0)?'<-- LATEST':'';
				console.log("%s) %s %s",i,commits[i].sha,message);
			}
			prompt.get([{
				description: 'Select a SHA'.cyan,
				type: 'string',
				pattern: /^\w+$/,
				required: true
			}], function(err,result) {
				SHA = commits[result.question].sha;
				return callback(null);
			});
		},
		function(callback){
			getConfigFiles(callback);
		},
		function(configs, callback){
			for(var i in configs) {
				console.log("%s) %s",i,configs[i].filename);
			}
			prompt.get([{
				description: 'Select a config file'.cyan,
				type: 'string',
				pattern: /^.+$/,
				required: true
			}], function(err,result) {
				configFile = configs[result.question].filename;
				return callback(null);
			});
		}
	], function (err, result) {
		if(err) {
			console.error(err);
			return;
		}
		//console.log(configFile);
		create.doIt('git@github.com:'+username+'/'+repoName,SHA,configFile);
});

return;


prompt.get([{
    description: 'Enter a github username'.cyan,
    type: 'string',
    pattern: /^\w+$/,
    default: 'jyoung360',
    required: true
  }], function (err, result) {
  	var username = result.question;
	getRepos('/users/'+username+'/repos',function(err,repos) {
		for(var i in repos) {
			console.log('%s) %s',i,repos[i].name);
		}

		prompt.get([{
			description: 'Select a repo',
			type: 'string',
			pattern: /^\w+$/,
			required: true
		}], function (err, result) {
			var repoName = repos[result.question].name;
			getCommits('/repos/'+username+'/'+repoName+'/commits',function(err,commits){
				for(var i in commits) {
					console.log("%s) %s -- %s",i,commits[i].sha,commits[i].commit.message);
				}
				prompt.get([{
					description: 'Select a SHA',
					type: 'string',
					pattern: /^\w+$/,
					required: true
				}], function (err, result) {
					var SHA = commits[result.question].sha;
					create.doIt('git@github.com:'+username+'/'+repoName,SHA);
				});
			});
		});
	});
	//getCommits('/repos/jyoung360/express-sample/commits');
});


//create.doIt();

/*
 * GET home page.
 */
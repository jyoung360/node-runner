var AWS = require('aws-sdk');
var fs = require('fs');
var http = require('http');
AWS.config.loadFromPath('/opt/node/aws/config.json');
var cloud = new AWS.CloudFormation();
var ec2 = new AWS.EC2();
var sns = new AWS.SNS();
var autoscaling = new AWS.AutoScaling();
var async = require('async');
var querystring = require('querystring');

var testTemplate = [
	{
		"tpm" : 100,
		"urlOrder" : "random",
		"duration" : 2,
		"urls" : [
			"http://www.cnn.com"
		]
	},
	{
		"tpm" : 200,
		"urlOrder" : "random",
		"duration" : 2,
		"urls" : [
			"http://www.yahoo.com"
		]
	},
	{
		"tpm" : 300,
		"urlOrder" : "random",
		"duration" : 2,
		"urls" : [
			"http://www.google.com"
		]
	}
];

var getJsonConfig = function(callback) {
	fs.readFile('../templates/load_tester.json', 'utf8', function (err, data) {
		if (err) {
			return callback(err);
		}
		var parameters = {
			"StackName" : "node-cluster-"+Math.round(Math.random()*1000)
			,"TemplateBody" : data
			,"Parameters" : []
		}
		return callback(null,parameters);
	});
}

var getNewInstances = function(autoscalingGroupName, stackName, callback) {
	var params = {
		"AutoScalingGroupNames" : [ autoscalingGroupName ]
	};
	autoscaling.describeAutoScalingGroups(params, function (err, data) {
		if (err) {
			return callback(err);
		} else {
			var instanceIds = [];
			for(var i in data.AutoScalingGroups[0].Instances) {
				instanceIds.push(data.AutoScalingGroups[0].Instances[i].InstanceId);
			}
			
			return callback(null,instanceIds,stackName);
		}
	});
}

var startInstances = function(instanceIds, stackName, callback) {
	console.log(stackName);
	ec2.describeInstances({"InstanceIds" : instanceIds},function(err,data){
		if(err) {
			return callback(err);
		}
		else {
			console.log(data.Reservations);
			var urls = [];
			async.each(data.Reservations, function(item,done) {
				var data;
				urls.push('http://'+item.Instances[0].PublicDnsName);
				postJsonToUrl(item.Instances[0].PublicDnsName,testTemplate,done);
				/*http.get('http://'+item.Instances[0].PublicDnsName+'/load/start', function(res) {
					res.setEncoding('utf8');
					console.log("Got response: " + res.statusCode);
					res.on('data', function (chunk) {
						data += chunk;
					});
					res.on('end', function(e) {
						console.log('all done %j',data);
						return done(null);
					});
				}).on('error', function(e) {
					return done(e);
				});*/
			}, function(err){
				if(err) { 
					return callback(err);
				}
				else {
					return callback(null,urls,stackName);
				}
			});
		}
	})
}

var postJsonToUrl = function(url, json, callback) {
	// Build the post string from an object
	var post_data = querystring.stringify({
		'json' : JSON.stringify(json)
	});

	// An object of options to indicate where to post to
	var post_options = {
		host: url,
		port: '80',
		path: '/load/start',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Content-Length': post_data.length
		}
	};

	// Set up the request
	var post_req = http.request(post_options, function(res) {
		res.setEncoding('utf8');
		res.on('data', function (chunk) {
			console.log('Response: ' + chunk);
		});
	});

	// post the data
	post_req.write(post_data);
	post_req.end();
	return callback(null);
}

var terminateStack = function(stackName,callback) {
	cloud.deleteStack({"StackName":stackName},function(err,response) {
		if(err) {
			return callback(err);
		}
		else {
			return callback(null,stackName+' has been deleted.');
		}
	});
}

var createCluster = function(parameters, imageId, callback) {
	parameters.Parameters.push({"ParameterKey":"AmiId", "ParameterValue":imageId});

	cloud.createStack(parameters,function(err,response) {
		if(err) {
			return callback(err);
		}
		else {
			isStackComplete(parameters.StackName,callback);
		}
	})
}

var isStackComplete = function(stackName, callback) {
	cloud.describeStacks({"StackName":stackName},function(err,response) {
		if(err) {
			return callback(err);
		}
		else {
			console.log(response.Stacks[0].StackStatus);
			if(response.Stacks[0].StackStatus === "CREATE_COMPLETE") {
				return callback(null,response.Stacks[0].Outputs[0].OutputValue,stackName);
			}
			else {
				return setTimeout(function() {
					isStackComplete(stackName,callback);
				},30000);
			}
		}
	});
}

var sendUpdate = function(message,callback) {
	sns.publish({"TopicArn" : "arn:aws:sns:us-west-2:176232384384:Graboid", "Message":message},callback);	
}

var instanceIds = [
"i-dec8a2ea",
"i-2fddbe19",
"i-77867e41"
];

var urls = ["http://ec2-54-202-126-34.us-west-2.compute.amazonaws.com","http://ec2-54-203-153-209.us-west-2.compute.amazonaws.com","http://ec2-54-203-79-244.us-west-2.compute.amazonaws.com"];

var pingUrls = function(urls, stackName, callback) {
	var unfinishedUrls = [];
	var collectedData = [];
	async.each(urls, function(item,done) {
		var data = '';
		http.get(item+'/load/status', function(res) {
			res.setEncoding('utf8');
			console.log("Got response: " + res.statusCode);

			res.on('data', function (chunk) {
				data += chunk;
			});
			res.on('end', function(e) {
				//console.log('all done %j',data);
				console.log('testing url %j',item);
				var response = JSON.parse(data);
				if(response.complete) {
					console.log('pushing to collectedData');
					collectedData.push(response);
				}
				else {
					console.log("%j is unfinshed",item);
					unfinishedUrls.push(item);
				}
				return done(null);
			});
		}).on('error', function(e) {
			return done(e);
		});
	}, function(err){
		if(err) { 
			return callback(err);
		}
		else {
			if(unfinishedUrls.length > 0) {
				return setTimeout(function() {
					pingUrls(urls,stackName,callback);
				},30000);
			}
			else {
				return callback(null,collectedData,stackName);
			}
		}
	});
}

async.waterfall([
		function(callback) {
			getJsonConfig(callback);
		},
		function(parameters, callback) {
			createCluster(parameters, 'ami-c8c5a1f8', callback);
		},
		function(autoscalingGroupName, stackName, callback){
			console.log("autoscaling group  %j created",autoscalingGroupName);
			getNewInstances(autoscalingGroupName, stackName, callback);
		},
		function(instanceIds, stackName, callback) {
			console.log('Waiting 30 secs for servers to start -- Fix this');
			setTimeout(function() { return callback(null,instanceIds, stackName); },30000);
		},
		function(instanceIds, stackName, callback){
			console.log("The following instances will be pinged: %j",instanceIds);
			startInstances(instanceIds, stackName, callback);
		},
		function(urls, stackName, callback) {
			pingUrls(urls, stackName, callback);
		},
		function(data,stackName,callback) {
			for(var i in data){
				for(var j in data[i].data) {
					console.log("%j had the following data %j",j,data[i].data[j]);
				}
			}
			console.log(data);
			terminateStack(stackName,callback);
		}
	], function (err, result) {
		if(err) {
			return console.log(err);
		}
		console.log(result);
});

//pingInstances(instanceIds);
//createCluster();

//determineImageStatus('ami-a40b9094','available',checkResult);
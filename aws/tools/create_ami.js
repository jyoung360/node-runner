var AWS = require('aws-sdk');
var fs = require('fs');
AWS.config.loadFromPath('./config.json');
var cloud = new AWS.CloudFormation();
var ec2 = new AWS.EC2();
var sns = new AWS.SNS();
var async = require('async');

//console.log(data);

var clusterParameters = {
	"StackName" : "node-"+Math.round(Math.random()*1000)
	,"TemplateBody" : undefined
	,"Parameters" : []
}

var getJsonConfig = function(filename, parameters, callback) {
	fs.readFile(filename, 'utf8', function (err, data) {
		if (err) {
			return callback(err);
		}
		var config = {
			"StackName" : "node-stack-"+Math.round(Math.random()*1000)
			,"TemplateBody" : data
			,"Capabilities" : ["CAPABILITY_IAM"]
			,"Parameters" : parameters
		}
		return callback(null,config);
	});
}

var createInstance = function(parameters,callback) {
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
				return callback(null,stackName);
			}
			else if(response.Stacks[0].StackStatus === "ROLLBACK_COMPLETE") {
				return callback('Deployment Failed')
			}
			else {
				return setTimeout(function() {
					isStackComplete(stackName,callback);
				},30000);
			}
		}
	});
}

var isAmiComplete = function(imageId, stackName, callback) {
	ec2.describeImages({"ImageIds":[imageId]},function(err,response) {
		if(err) {
			return callback(err);
		}
		else {
			console.log(response.Images[0].State);
			if(response.Images[0].State === "available") {
				return callback(null,imageId,stackName);
			}
			else {
				return setTimeout(function() {
					isAmiComplete(imageId, stackName, callback);
				},30000);
			}
		}
	});
}

var checkResult = function(status,desiredStatus,success,fail) {
	console.log(status);
	if(status !== desiredStatus) {
		setTimeout(fail,30000);
	}
	else {
		success();
	}
}

var createAmi = function(stackName,callback) {
	cloud.describeStackResource({"StackName":stackName, "LogicalResourceId" : "WebServer"},function(err,response) {
		if(err) {
			return callback(err);
		}
		var params = {
			"InstanceId" : response.StackResourceDetail.PhysicalResourceId,
			"Name" : response.StackResourceDetail.StackName+"-ami"
		}
		ec2.createImage(params, function(err,response) {
			if(err) {
				return callback(err);
			}
			else {
				isAmiComplete(response.ImageId,stackName,callback);
			}
		});
	});
}

var determineStackStatus = function(desiredState,statusCheck,callback) {
	cloud.describeStacks({"StackName":parameters.StackName},function(err,response) {
		if(err) {
			console.log(err.message);
		}
		else {
			callback(response.Stacks[0].StackStatus,desiredState,imageInstance,function() { determineStackStatus(desiredState,callback); });
		}
	});
}

var tagResources = function(resources, tags, stackName, callback) {
	var params = {
		"Resources" : resources,
		"Tags" : tags
	}
	ec2.createTags(params, function(err,response) {
		if(err) {
			return callback(err);
		}
		else {
			callback(null,stackName);
		}
	});
}

var imageInstance = function() {
	sendUpdate("CloudFormation Stack Created",function(err,data) {
		createAmi(function(err,result) {
			if(err) {
				return callback(err)
			}
			else {
				determineImageStatus(result.ImageId, 'available', checkResult);
			}
		});
	});
}

var determineImageStatus = function(imageId, desiredState, callback) {
	ec2.describeImages({"ImageIds":[imageId]},function(err,response) {
		if(err) {
			console.log(err);
		}
		else {
			callback(response.Images[0].State, desiredState, function() { 
				sendUpdate("AMI created with ID "+imageId,function(){
					terminateStack(imageId); 
				});
			}, function() { 
				determineImageStatus(imageId, desiredState, callback); 
			});
		}
	});
}

var terminateStack = function(stackName, callback) {
	cloud.deleteStack({"StackName":stackName},function(err,response) {
		if(err) {
			return callback(err);
		}
		else {
			return callback(null,response);
		}
	});
}

var createCluster = function(imageId, callback) {
	fs.readFile('../templates/base_cluster.json', 'utf8', function (err, data) {
		if (err) {
			console.log('Error: ' + err);
			return;
		}

		clusterParameters.TemplateBody = data;
		clusterParameters.Parameters.push({"ParameterKey":"AmiId", "ParameterValue":imageId});

		cloud.createStack(clusterParameters,function(err,response) {
			if(err) {
				console.log(err.message);
			}
			else {
				console.log(response);
				//determineStackStatus('CREATE_COMPLETE', checkResult);
			}
		})
	});
}

var sendUpdate = function(message,callback) {
	console.log('hi');
	sns.publish({"TopicArn" : "arn:aws:sns:us-west-2:176232384384:Graboid", "Message":message},callback);	
}

exports.doIt = function(service,version,templateFile){
	async.waterfall([
			function(callback) {
				var parameters = [
					{
						"ParameterKey":"GitHubRepo",
						"ParameterValue":service
					},
					{
						"ParameterKey":"GitHubSHA",
						"ParameterValue":version
					},
				];
				getJsonConfig('../templates/asymptomatic-service/cloudformation/base_ami.json', parameters, callback);
			},
			function(parameters,callback) {
				createInstance(parameters,callback);
			},
			function(stackName, callback){
				console.log("Stack %j created",stackName);
				createAmi(stackName,callback);
			},
			function(imageId,stackName, callback){
				console.log("AMI %j created in stack %j",imageId,stackName);
				var tags = [
					{
						"Key" : "Version",
						"Value" : version
					},
					{
						"Key" : "Service",
						"Value" : service
					},
					{
						"Key" : "Build Date",
						"Value" : new Date().toISOString()
					},
				]
				tagResources([imageId],tags,stackName,callback);
			},
			function(stackName, callback){
				console.log("Image tagged successfully");
				terminateStack(stackName,callback);
			}
		], function (err, result) {
			console.log(err);
			console.log(result);
	});
};


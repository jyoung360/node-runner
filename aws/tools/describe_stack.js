var AWS = require('aws-sdk');
var fs = require('fs');
AWS.config.loadFromPath('/opt/node/aws/config.json');
var cloud = new AWS.CloudFormation();
var sns = new AWS.SNS();

sns.publish({"TopicArn" : "arn:aws:sns:us-west-2:176232384384:Graboid", "Message":"All good"}, function (err, data) {
  if (err) {
    console.log(err); // an error occurred
  } else {
    console.log(data); // successful response
  }
});
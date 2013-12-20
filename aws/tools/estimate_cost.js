var AWS = require('aws-sdk');
AWS.config.loadFromPath('./prod_config.json');
var ec2 = new AWS.EC2();

ec2.describeSnapshots({"OwnerIds":['self']}, function(err,data){
	if(err) {
		console.log(err);
	}
	else {
		//console.log(data);
		var total = 0;
		for(var i in data.Snapshots) {
			total += data.Snapshots[i].VolumeSize;
		}
		var monthlyCost = total*.1;
		var yearlyCost = monthlyCost*12;
		console.log("Total EBS storage of %j GB costs $%j/month and $%j/year",total,monthlyCost,yearlyCost);
	}
})

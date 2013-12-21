node-runner
===========
## About
node-runner is a node.js based tool which can be used to create any number of AWS instances of a desired size.  These instances come pre-loaded with a custom [Express.js](http://expressjs.com/) webserver which runs on server creation via [upstart](http://upstart.ubuntu.com/).  Each instance can be configured with a custom JSON file which contains an array of test objects.  These test objects can be configured to run a series of URLs sequentially or randomly at a defined rate and duration.  

####The webserver is controlled by the following endpoints.

* POST /load/start
	* requires the following body parameter (json)
* GET /load/status
	* returns a JSON object with the current statistics on the running data set
* GET /load/end
	* aborts the current run

## Configuration

### Step 1 -- Create ./aws/tools/config.json with following format

```
{ 
	"accessKeyId" : AWS_ACCESS_KEY_ID,
	"secretAccessKey" : AWS_SECRET_KEY,
	"region": AWS_REGION,
	"apiVersions" : {
	  "cloudformation": "2010-05-15",
	  "sns": "2010-03-31"
	}
}
```
### Step 2 -- Configure the JSON data set
The object "testTemplate" is located inside ./aws/tools/create_load_testing_cluster.js
This object is an array of URL sets which have the following format:

```
{
	"tpm" : <transactions per minute>,
	"urlOrder" : "random",
	"duration" : <duration in seconds>,
	"urls" : <array of url endpoints to submit GET requests to>
}
```

### Step 3 -- Start the test

```
node ./aws/tools/create_load_testing_cluster.js

```

## Under the hood
When create_load_testing_cluster.js is initiated, it will perform the following actions.

* Create a N instances where N is defined in the following CloudFormation template ./aws/templates/load_tester.json
* Monitor the CloudFormation deployment until all instances have been created
* Query the Autoscaling group output from CloudFormation to find the instances
* Query the instances to get their public DNS name
* Start each instance via the running webserver.
* Monitor the status of each instance to determine when each has completed
* Once all instances have completed their run, the data is retreived and compiled into a single data set.
* Terminates the Cloudformation Stack (this destroys all created resources)
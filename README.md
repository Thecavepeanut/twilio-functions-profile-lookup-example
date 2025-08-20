# twilio-functions-profile-lookup-example

This repository contains an example of running a profile lookup given an phone or email.  Once the profile is found the function will attach the profile connect sid to context so the FE and other services can use it.


## Local development
Make sure to make a .env and a .twiliodeployinfo from the examples.  The .twiliodeployinfo will need the service sid and the sid for the latest build.  The .env file will need your account sid and account token so it can do the push to your service.

After the env and twiliodeploy info are done this is how you start the function locally
```
npm i 
```
```
npm run start
```
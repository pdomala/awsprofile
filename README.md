# AWSPROFILE

[![Build Status](https://dev.azure.com/prasaddomala/awsprofile-npm/_apis/build/status/pdomala.awsprofile?branchName=master)](https://dev.azure.com/prasaddomala/awsprofile-npm/_build/latest?definitionId=2&branchName=master)

CLI tool to create, manage & renew your AWS profiles

## Features

- Create AWS profiles interactively
- Create MFA based AWS profiles
- Renew MFA based AWS profiles
- Create Assumed profiles based on a source profile
- Renew assumed profiles
- Set defaults (Region, Output, MFA serial, Session Duration) which can be used while creating profiles
- List all profiles in a tabular format with expiry details if applicable
- Easy switching of profiles using aliases

## Installation

```
npm install -g awsprofile
```

View Usage
```
awsprofile -h
```

## Create profiles

```
awsprofile create
```

### Normal profile without MFA

![create-no-mfa](https://raw.githubusercontent.com/pdomala/awsprofile/master/assets/create-no-mfa.png)

### Normal profile with MFA

![create-mfa](https://raw.githubusercontent.com/pdomala/awsprofile/master/assets/create-mfa.png)

### Assumed profile

![assumed](https://raw.githubusercontent.com/pdomala/awsprofile/master/assets/assumed.png)

## Renew Profiles (MFA / Assumed)

![renewed](https://raw.githubusercontent.com/pdomala/awsprofile/master/assets/renew.png)

## List Profiles

![list](https://raw.githubusercontent.com/pdomala/awsprofile/master/assets/list.png)

## List Aliases

![list](https://raw.githubusercontent.com/pdomala/awsprofile/master/assets/listaliases.png)

## Set defaults

![defaults](https://raw.githubusercontent.com/pdomala/awsprofile/master/assets/defaults.png)



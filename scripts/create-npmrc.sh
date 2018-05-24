#!/bin/bash

printf "Creating npmrc file\n"

printf "registry=https://purecloud.artifactoryonline.com/purecloud/api/npm/inin-internal-npm/\n//purecloud.artifactoryonline.com/purecloud/api/npm/inin-internal-npm/:_password=%s\n//purecloud.artifactoryonline.com/purecloud/api/npm/inin-internal-npm/:username=%s\n//purecloud.artifactoryonline.com/purecloud/api/npm/inin-internal-npm/:always-auth=true" "$PASSWORD" "$USERNAME" >> .npmrc

cat .npmrc

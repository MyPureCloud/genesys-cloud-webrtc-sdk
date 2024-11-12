import groovy.json.JsonBuilder

@Library('pipeline-library') _

def MAIN_BRANCH = 'master'
def DEVELOP_BRANCH = 'develop'
def isBitbucket = false

def isMain = {
  env.BRANCH_NAME == MAIN_BRANCH
}

def isRelease = {
  env.BRANCH_NAME.startsWith('release/')
}

def isDevelop = {
  env.BRANCH_NAME == DEVELOP_BRANCH
}

def isMainline = {
  isMain() || isDevelop() || isRelease()
}

def getBranchType = {
  isMainline() ? 'MAINLINE' : 'FEATURE'
}

def hasRunSpigotTests = false
def testSpigotByEnv = { environment, branch ->
   stage("Spigot test '${environment}'") {
        script {
            println("Scheduling spigot test for: { env: '${environment}', branch: '${branch}' }")
            build(job: 'spigot-tests-webrtcsdk-entry',
                    parameters: [
                        string(name: 'ENVIRONMENT', value: environment),
                        string(name: 'BRANCH_TO_TEST', value: branch)
                    ],
                    propagate: true,
                    wait: true // wait for the test job to finish
            )
        }
    }
}

def npmFunctions = new com.genesys.jenkins.Npm()
def gitFunctions = new com.genesys.jenkins.Git()
def notifications = new com.genesys.jenkins.Notifications()

def chatGroupId = 'adhoc-60e40c95-3d9c-458e-a48e-ca4b29cf486d'

webappPipeline {
    projectName = 'developercenter-cdn/webrtc-sdk'
    team = 'Client Streaming and Signaling'
    jiraProjectKey = 'STREAM'
    mailer = 'GcMediaStreamSignal@genesys.com'
    chatGroupId = chatGroupId
    useSkynetV2 = true

    nodeVersion = '18.x'
    buildType = getBranchType

    manifest = customManifest('dist') {
        sh('node ./create-manifest.js')
        readJSON(file: 'dist/manifest.json')
    }

    snykConfig = {
      return [
        organization: 'genesys-client-media-webrtc',
        wait: true
      ]
    }

    autoSubmitCm = true

    testJob = 'no-tests' // see buildStep to spigot tests

    ciTests = {
      sh('node -e "console.log(process.env)"')

        println("""
========= BUILD VARIABLES =========
ENVIRONMENT  : ${env.ENVIRONMENT}
BUILD_NUMBER : ${env.BUILD_NUMBER}
BUILD_ID     : ${env.BUILD_ID}
BRANCH_NAME  : ${env.BRANCH_NAME}
APP_NAME     : ${env.APP_NAME}
VERSION      : ${env.VERSION}
===================================
      """)

      sh("""
        npm i -g npm@7
        npm ci
        npm run test
      """)
    }

    buildStep = {cdnUrl ->
        sh("""
            echo 'CDN_URL ${cdnUrl}'
            npm --versions
            npm run build
            npm run build:sample
        """)

        // // run spigot tests on release/ branches
        // if (isRelease() && !hasRunSpigotTests) {
        //   testSpigotByEnv('dev', env.BRANCH_NAME);
        //   testSpigotByEnv('test', env.BRANCH_NAME);
        //   testSpigotByEnv('prod', env.BRANCH_NAME);
        //   hasRunSpigotTests = true // have to use this because it builds twice (once for legacy build)
        // }
    }

    onSuccess = {
       sh("""
            echo "=== root folder ==="
            ls -als ./

            echo "=== Printing manifest.json ==="
            cat ./manifest.json

            echo "=== Printing package.json ==="
            cat ./package.json

            echo "=== dist folder ==="
            ls -als dist/

            echo "=== Printing dist/deploy-info.json ==="
            cat ./dist/deploy-info.json

            # echo "=== Printing dist/package.json ==="
            # cat ./dist/package.json
        """)

        // NOTE: this version only applies to the npm version published and NOT the cdn publish url/version
        def version = env.VERSION
        def packageJsonPath = "./package.json"
        def tag = ""

        // save a copy of the original package.json
        // sh("cp ${packageJsonPath} ${packageJsonPath}.orig")

        // if not MAIN branch, then we need to adjust the verion in the package.json
        if (!isMain()) {
          // load the package.json version
          def packageJson = readJSON(file: packageJsonPath)
          def featureBranch = env.BRANCH_NAME

          // all feature branches default to --alpha
          tag = "alpha"

          if (isRelease()) {
            tag = "next"
            featureBranch = "release"
          }

          if (isDevelop()) {
            tag = "beta"
            featureBranch = "develop"
          }

          version = "${packageJson.version}-${featureBranch}.${env.BUILD_NUMBER}".toString()
        }

        stage('Publish to NPM') {
            script {
                dir(pwd()) {
                    npmFunctions.publishNpmPackage([
                        tag: tag, // optional
                        useArtifactoryRepo: isBitbucket, // optional, default `true`
                        version: version, // optional, default is version in package.json
                        dryRun: false // dry run the publish, default `false`
                    ])
                }

                def message = "**${env.APP_NAME}** ${version} (Build [#${env.BUILD_NUMBER}](${env.BUILD_URL})) has been published to **npm**"

                if (!tag) {
                  message = ":loudspeaker: ${message}"
                }

                notifications.requestToGenericWebhooksWithMessage(chatGroupId, message);
            }
        } // end publish to npm

        if (isMain()) {
            stage('Tag commit and merge main branch back into develop branch') {
                script {
                    gitFunctions.tagCommit(
                      "v${version}",
                      gitFunctions.getCurrentCommit(),
                      isBitbucket
                    )

                    gitFunctions.mergeBackAndPrep(
                      MAIN_BRANCH,
                      DEVELOP_BRANCH,
                      'patch',
                      isBitbucket
                    )
                }
            } // end tag commit and merge back
        } // isMain()

    } // onSuccess
} // end

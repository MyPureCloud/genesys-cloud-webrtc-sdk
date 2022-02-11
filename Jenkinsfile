import groovy.json.JsonBuilder

@Library('pipeline-library@COMUI-857') _

def MAIN_BRANCH = 'master'
def DEVELOP_BRANCH = 'develop'

def isMain = {
  env.BRANCH_NAME == MAIN_BRANCH
}

def isRelease = {
  env.BRANCH_NAME.startsWith('release/')
}

def isDevelop = {
  env.BRANCH_NAME == DEVELOP_BRANCH
}

def getBuildType = {
  isMain()
    ? 'MAINLINE'
    : 'FEATURE'
}

def testSpigotByEnv = { environment, version ->
   stage("Spigot test '${environment}'") {
        script {
            println("Scheduling spigot test for: { env: '${environment}', branch: '${version}'")
            build(job: 'spigot-tests-webrtcsdk-entry',
                    parameters: [
                        string(name: 'ENVIRONMENT', value: environment),
                        string(name: 'BRANCH_TO_TEST', value: version)
                    ],
                    propagate: true,
                    wait: true // wait for the test job to finish
            )
        }
    }
}
def hasRunSpigotTests = false

webappPipeline {
    projectName = 'developercenter-cdn/webrtc-sdk'
    team = 'Genesys Client Media (WebRTC)'
    mailer = 'genesyscloud-client-media@genesys.com'
    chatGroupId = '763fcc91-e530-4ed7-b318-03f525a077f6'

    nodeVersion = '14.x'
    buildType = getBuildType

    manifest = customManifest('dist') {
        sh('node ./create-manifest.js')
        readJSON(file: 'dist/manifest.json')
    }

    testJob = 'no-tests' // see buildStep to spigot tests

    ciTests = {
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

        // run spigot tests on release/ branches
        if (isRelease() && !hasRunSpigotTests) {
          testSpigotByEnv('dev', env.VERSION);
          testSpigotByEnv('test', env.VERSION);
          testSpigotByEnv('prod', env.VERSION);
          hasRunSpigotTests = true // have to use this because it builds twice (once for legacy build)
        }
    }

    deployConfig = [
      dev : 'always',
      test : 'always',
      prod : 'always',
      'fedramp-use2-core': 'always'
    ]

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

        def npmFunctions = null
        def gitFunctions = null
        def pwd = pwd()

        stage('Download npm & git utils') {
            script {
              // clone pipelines repo
                dir('pipelines') {
                    git branch: 'COMUI-857',
                        url: 'git@bitbucket.org:inindca/pipeline-library.git',
                        changelog: false

                    npmFunctions = load 'src/com/genesys/jenkins/Npm.groovy'
                    gitFunctions = load 'src/com/genesys/jenkins/Git.groovy'
                }
            }
        } // end download pipeline utils

        stage('Publish to NPM') {
            script {
                dir(pwd) {
                    npmFunctions.publishNpmPackage([
                        tag: tag, // optional
                        useArtifactoryRepo: false, // optional, default `true`
                        version: version, // optional, default is version in package.json
                        dryRun: false // dry run the publish, default `false`
                    ])
                }
            }
        } // end publish to npm

        if (isMain()) {
            stage('Tag commit and merge main branch back into develop branch') {
                script {
                    gitFunctions.tagCommit(
                      "v${version}",
                      gitFunctions.getCurrentCommit(),
                      false
                    )

                    gitFunctions.mergeBackAndPrep(
                      MAIN_BRANCH,
                      DEVELOP_BRANCH,
                      'patch',
                      false
                    )
                }
            } // end tag commit and merge back
        } // isMain()

    } // onSuccess
} // end
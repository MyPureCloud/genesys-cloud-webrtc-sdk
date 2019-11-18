@Library('pipeline-library@webapp-pipelines') _

webappPipeline {
    slaveLabel = 'dev'
    nodeVersion = '10.16.2'
    useArtifactoryRepo = false
    projectName = 'developercenter-cdn/webrtc-sdk'
    manifest = customManifest('dist') {
        sh('node ./create-manifest.js')
        readJSON(file: 'dist/manifest.json')
    }
    buildType = { (env.BRANCH_NAME == 'master' || env.BRANCH_NAME.startsWith('release/')) ? 'MAINLINE' : 'FEATURE' }
    publishPackage = { 'prod' }
    testJob = 'valve-webrtcsdk-tests'

    buildStep = {
        sh('''
            export CDN_URL="$(npx cdn --ecosystem pc --name $APP_NAME --build $BUILD_ID --version $VERSION)"
            echo "CDN_URL $CDN_URL"
            npm i && npm test && npm run build
            # TODO: reenable this. unstable right now
            # npm run build-sample
        ''')
    }

    cmConfig = {
        return [
            managerEmail: 'purecloud-client-media@genesys.com',
            rollbackPlan: 'Patch version with fix',
            testResults: 'https://jenkins.ininica.com/job/valve-webrtcsdk-tests-test/'
        ]
    }

    shouldTagOnRelease = { false }

    postReleaseStep = {
        sshagent(credentials: [constants.credentials.github.inin_dev_evangelists]) {
            if (env.BRANCH_NAME == 'master') {
                sh("""
                    # patch to prep for the next version
                    npm version patch --no-git-tag-version
                    git commit -am "Prep next version"
                    git push origin HEAD:master
                """)
            }
        }
    }
}

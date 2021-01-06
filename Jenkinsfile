@Library('pipeline-library@webapp-pipelines') _

webappPipeline {
    slaveLabel = 'dev_v2'
    nodeVersion = '10.16.2'
    useArtifactoryRepo = false
    projectName = 'developercenter-cdn/webrtc-sdk'
    manifest = customManifest('dist') {
        sh('node ./create-manifest.js')
        readJSON(file: 'dist/manifest.json')
    }
    buildType = { (env.BRANCH_NAME == 'master' || env.BRANCH_NAME.startsWith('release/')) ? 'MAINLINE' : 'FEATURE' }
    publishPackage = { 'prod' }
    testJob = 'spigot-tests-webrtcsdk'

    buildStep = {
        sh('''
            export CDN_URL="$(npx cdn --ecosystem pc --name $APP_NAME --build $BUILD_ID --version $VERSION)"
            echo "CDN_URL $CDN_URL"
            npm i && npm test && npm run build
            npm run build:sample
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
            sh("""
                git tag v${version}
                git push origin --tags
            """)
        }
    }
}

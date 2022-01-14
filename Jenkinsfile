// this will need to be pipeline-library@master when the pr merges
@Library('pipeline-library@ui-pipeline-legacy') _

webappPipeline {
    slaveLabel = 'dev_v2'
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
            npm i -g npm@7
            npm --versions
            export CDN_URL="$(npx cdn --ecosystem pc --name $APP_NAME --build $BUILD_ID --version $VERSION)"
            echo "CDN_URL $CDN_URL"
            npm ci && npm test && npm run build
            npm run build:sample
        ''')
    }

    snykConfig = {
        return [
            organization: 'genesys-client-media-webrtc',
        ]
    }

    cmConfig = {
        return [
            managerEmail: 'purecloud-client-media@genesys.com',
            rollbackPlan: 'Patch version with fix',
            testResults: 'https://jenkins.ininica.com/job/valve-webrtcsdk-tests-test/',
            qaId: '5d41d9195ca9700dac0ef53a'
        ]
    }

    shouldTagOnRelease = { true }

    postReleaseStep = {
        sshagent(credentials: [constants.credentials.github.inin_dev_evangelists]) {
            sh("""
                node scripts/prep-version.js
            """)
        }
    }
}

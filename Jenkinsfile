// Jenkins counterpart of .github/workflows/ci.yml (CI-03): the gates, then one end-to-end run of
// the Petstore pack, reported as one run. What each step does and why: docs/ci.md (Jenkins).
//
// Agent requirements: git, Node at the major version in .nvmrc on the PATH, and Docker with the
// compose plugin. Linux agents run the steps with `sh`, Windows agents with `bat`.
// Plugins: Pipeline, Git, Credentials Binding, JUnit, Timestamper; Allure is optional.

def shell(Map options = [:], String command) {
  if (isUnix()) {
    return sh(options + [script: command])
  }
  // `@` keeps the command itself out of the output, so returnStdout returns only what it prints.
  return bat(options + [script: "@${command}"])
}

/** A relative path with the separators of the agent's shell (cmd reads `/x` as a switch). */
def nativePath(String path) {
  return isUnix() ? path : path.replace('/', '\\')
}

// Set once the suite starts; the post steps publish results only then.
suiteRan = false

pipeline {
  // Parameters exist only after the first build has read this file, hence the fallback.
  agent { label params.AGENT_LABEL ?: '' }

  options {
    timeout(time: 60, unit: 'MINUTES')
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  parameters {
    string(name: 'AGENT_LABEL', defaultValue: '', description: 'Label of the agent that runs the build; empty means any agent.')
    string(name: 'API_KEY_CREDENTIALS_ID', defaultValue: '', description: 'Secret-text credential with the API key. Empty: a random key per build, which the Petstore accepts.')
    string(name: 'PETSTORE_PORT', defaultValue: '', description: 'Host port for the Petstore container when 8080 is taken (for example by Jenkins itself); the API URLs follow it.')
    string(name: 'API_BASE_URL', defaultValue: '', description: 'Overrides the environment base URL, e.g. http://host.docker.internal:8080/api/v3 when the agent runs in a container.')
    string(name: 'API_SPEC_URL', defaultValue: '', description: 'Overrides the environment contract URL, same reason as API_BASE_URL.')
    string(name: 'ALLURE_TOKEN_CREDENTIALS_ID', defaultValue: '', description: 'Secret-text credential with an Allure TestOps API token. Set: the run is reported to TestOps instead of the tool in qa-config.')
    string(name: 'ALLURE_ENDPOINT', defaultValue: '', description: 'Allure TestOps instance URL, with ALLURE_TOKEN_CREDENTIALS_ID.')
    string(name: 'ALLURE_PROJECT_ID', defaultValue: '', description: 'Allure TestOps project id, with ALLURE_TOKEN_CREDENTIALS_ID.')
    booleanParam(name: 'PUBLISH_ALLURE', defaultValue: false, description: 'Publish allure-results with the Allure plugin (needs an Allure Commandline tool).')
  }

  environment {
    // Own compose project, so `petstore:down` and the recovery restart touch only this build's container.
    COMPOSE_PROJECT_NAME = 'qa-jenkins'
    // One run id from execution to the test-management tool (L-48), traceable to this build.
    QA_RUN_ID = "${env.BUILD_TAG}"
    QA_JUNIT_REPORT = 'reports/junit.xml'
    CI = 'true'
  }

  stages {
    stage('Node') {
      steps {
        script {
          String wanted = readFile('.nvmrc').trim()
          String actual = shell(returnStdout: true, 'node -p "process.versions.node.split(\'.\')[0]"').trim()
          if (actual != wanted) {
            error("The agent has Node ${actual}; .nvmrc asks for ${wanted}.")
          }
        }
      }
    }

    stage('Install') {
      steps {
        shell 'npm ci'
      }
    }

    // Needs no API and no binary beyond git and Node (gitleaks runs only in the git hooks).
    stage('Gates') {
      steps {
        shell 'npm run gates'
      }
    }

    stage('e2e (petstore)') {
      steps {
        script {
          withApiEnvironment {
            // docker compose rather than a sidecar: the destructive lane's recovery is
            // `docker compose restart petstore` (qa-config api.environments.local.recovery).
            timeout(time: 5, unit: 'MINUTES') {
              shell 'npm run petstore:up'
            }

            // The preflight project runs first; when it fails, no API case runs. A failing suite
            // marks the build failed but the steps below still run, as in the GitHub workflow.
            suiteRan = true
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              shell 'npx playwright test --project=api'
            }

            // Last, and only after the shared run: each @destructive case alone, then the recovery.
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              shell 'npm run lanes:destructive'
            }

            // The `local` tool keeps its definitions in reports/tm/local, which is not tracked, so a
            // fresh workspace starts empty: rebuild them from the registries before reporting.
            String provider = shell(returnStdout: true,
              'node -p "require(\'./qa-config.example.json\').test_management.provider"').trim()
            if (!params.ALLURE_TOKEN_CREDENTIALS_ID && !fileExists('qa-config.json') && provider == 'local') {
              shell 'npm run tm:publish -- --service petstore'
            }

            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              withTestManagement {
                shell 'npm run tm:report -- --service petstore'
              }
            }
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              shell 'npm run coverage:status'
            }
            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
              shell 'npm run quality:gate'
            }
          }
        }
      }
    }
  }

  post {
    always {
      script {
        if (suiteRan) {
          // One index.html that opens from disk (allurerc.mjs), archived with the reports, so the
          // report needs no Allure plugin; PUBLISH_ALLURE adds the plugin's view on top.
          shell(returnStatus: true, 'npm run report:html')
          junit(testResults: 'reports/junit.xml', allowEmptyResults: true)
          if (fileExists('reports/quality-gate.md')) {
            echo readFile('reports/quality-gate.md')
          }
          if (params.PUBLISH_ALLURE) {
            allure(results: [[path: 'allure-results']])
          }
        }
      }
      archiveArtifacts(artifacts: 'reports/**, playwright-report/**, allure-results/**', allowEmptyArchive: true)
    }
    failure {
      script {
        shell(returnStatus: true, "docker compose logs --no-color petstore > ${nativePath('reports/petstore.log')} 2>&1")
        archiveArtifacts(artifacts: 'reports/petstore.log', allowEmptyArchive: true)
      }
    }
    cleanup {
      script {
        shell(returnStatus: true, 'npm run petstore:down')
      }
    }
  }
}

// The variable named by qa-config api.auth.env, from a credential when one is configured, otherwise
// a random value per build; plus the optional port and URL overrides.
def withApiEnvironment(Closure body) {
  List<String> overrides = []
  String port = params.PETSTORE_PORT ?: ''
  if (port) {
    overrides << "PETSTORE_PORT=${port}"
  }
  String baseUrl = params.API_BASE_URL ?: (port ? "http://localhost:${port}/api/v3" : '')
  String specUrl = params.API_SPEC_URL ?: (port ? "http://localhost:${port}/api/v3/openapi.json" : '')
  if (baseUrl) {
    overrides << "API_BASE_URL=${baseUrl}"
  }
  if (specUrl) {
    overrides << "API_SPEC_URL=${specUrl}"
  }
  withEnv(overrides) {
    if (params.API_KEY_CREDENTIALS_ID) {
      withCredentials([string(credentialsId: params.API_KEY_CREDENTIALS_ID, variable: 'API_KEY')]) {
        body()
      }
    } else {
      String key = shell(returnStdout: true,
        'node -p "require(\'node:crypto\').randomBytes(12).toString(\'hex\')"').trim()
      withEnv(["API_KEY=${key}"]) {
        body()
      }
    }
  }
}

// Allure TestOps receives the run when its token credential is configured (docs/ci.md#reporting-to-
// allure-testops); the token reaches only the report step. Otherwise the tool in qa-config does.
def withTestManagement(Closure body) {
  if (!params.ALLURE_TOKEN_CREDENTIALS_ID) {
    body()
    return
  }
  withEnv([
    'QA_TM_PROVIDER=allure-testops',
    "ALLURE_ENDPOINT=${params.ALLURE_ENDPOINT}",
    "ALLURE_PROJECT_ID=${params.ALLURE_PROJECT_ID}",
  ]) {
    withCredentials([string(credentialsId: params.ALLURE_TOKEN_CREDENTIALS_ID, variable: 'ALLURE_TOKEN')]) {
      body()
    }
  }
}

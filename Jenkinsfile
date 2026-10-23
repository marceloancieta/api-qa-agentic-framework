// Jenkins counterpart of .github/workflows/ci.yml (CI-03): the gates, then the end-to-end runs of
// the Petstore, VAmPI and Keycloak packs, archived as one report. What each step does and why:
// docs/ci.md (Jenkins).
//
// Agent requirements: git, Node at the major version in .nvmrc on the PATH with its own npm, Docker
// with the compose plugin, and Java on the PATH when the Allure plugin publishes (PUBLISH_ALLURE).
// Linux agents run the steps with `sh`, Windows agents with `bat`.
// Plugins: Pipeline, Git, Credentials Binding, JUnit, Timestamper; Allure is optional.

import groovy.transform.Field

def shell(Map options = [:], String command) {
  if (isUnix()) {
    return sh(options + [script: command])
  }
  // `@` keeps the command itself out of the output, so returnStdout returns only what it prints.
  return bat(options + [script: "@${command}"])
}

/**
 * A parameter, or, when it is empty, the Jenkins environment variable DEFAULT_<name> (global, or set
 * on the agent). A scheduled build takes every parameter's default, so this is how it still gets the
 * machine's setup: the port, the API URLs, the TestOps project (docs/ci.md#jenkins). The fallback
 * has its own name because Jenkins also exposes each parameter as a variable of the same name,
 * empty when the parameter is, which would hide one set on the agent.
 */
def setting(String name) {
  return (params[name] ?: env."DEFAULT_${name}" ?: '').toString().trim()
}

/** A relative path with the separators of the agent's shell (cmd reads `/x` as a switch). */
def nativePath(String path) {
  return isUnix() ? path : path.replace('/', '\\')
}

// Set once the suite starts; the post steps publish results only then.
@Field boolean suiteRan = false

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
    string(name: 'PETSTORE_BASE_URL', defaultValue: '', description: 'Overrides the base URL of the petstore pack (exported as QA_PETSTORE_BASE_URL), e.g. http://host.docker.internal:8080/api/v3 when the agent runs in a container.')
    string(name: 'PETSTORE_SPEC_URL', defaultValue: '', description: 'Overrides the contract URL of the petstore pack (exported as QA_PETSTORE_SPEC_URL), same reason as PETSTORE_BASE_URL.')
    string(name: 'ALLURE_TOKEN_CREDENTIALS_ID', defaultValue: '', description: 'Secret-text credential with an Allure TestOps API token. Set: the run is reported to TestOps instead of the tool in qa-config.')
    string(name: 'ALLURE_ENDPOINT', defaultValue: '', description: 'Allure TestOps instance URL, with ALLURE_TOKEN_CREDENTIALS_ID.')
    string(name: 'ALLURE_PROJECT_ID', defaultValue: '', description: 'Allure TestOps project id, with ALLURE_TOKEN_CREDENTIALS_ID.')
    booleanParam(name: 'PUBLISH_ALLURE', defaultValue: true, description: 'Publish allure-results with the Allure plugin (it needs an Allure Commandline tool). Without the plugin the build only prints a notice.')
  }

  environment {
    // Own compose project, so `petstore:down` and the recovery restart touch only this build's container.
    COMPOSE_PROJECT_NAME = 'qa-jenkins'
    // One run id from execution to the test-management tool (L-48), traceable to this build.
    QA_RUN_ID = "${env.BUILD_TAG}"
    // No build-wide QA_JUNIT_REPORT: each Playwright step names its own JUnit file and HTML folder
    // (reportsOf below), so a later step never overwrites an earlier one (CI-09).
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
          // npm must run its scripts with this Node, on this platform. On a Linux agent in WSL the
          // Windows PATH follows the Linux one, and a Windows npm found there runs every `npm run`
          // through cmd.exe, which refuses the workspace's path (CI-16).
          String platform = shell(returnStdout: true, 'node -p "process.platform"').trim()
          String viaNpm = shell(returnStdout: true, 'npm exec -c "node -p process.platform"').trim()
          if (viaNpm != platform) {
            error("npm does not run its scripts with the agent's Node (${platform}); it printed: " +
              "${viaNpm.take(300)}. Put that Node's npm first on the agent's PATH " +
              '(docs/ci.md, "A Linux agent in WSL").')
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
            // `docker compose restart petstore` (qa-config
            // api.environments.local.packs.petstore.recovery).
            timeout(time: 5, unit: 'MINUTES') {
              shell 'npm run petstore:up'
            }

            // Only the pack whose service this build starts; its preflight project runs first and,
            // when it fails, none of its cases runs. A failing suite marks the build failed but the
            // steps below still run, as in the GitHub workflow.
            suiteRan = true
            withEnv(reportsOf('petstore')) {
              catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                shell 'npx playwright test --project=api-petstore'
              }
            }

            // Last, and only after the shared run: each @destructive case alone, then the recovery.
            // The lane gives every case its own report next to these names.
            withEnv(reportsOf('petstore-destructive')) {
              catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                shell 'npm run lanes:destructive -- --service petstore'
              }
            }

            // The `local` tool keeps its definitions in reports/tm/local, which is not tracked, so a
            // fresh workspace starts empty: rebuild them from the registries before reporting.
            String provider = shell(returnStdout: true,
              'node -p "require(\'./qa-config.example.json\').test_management.provider"').trim()
            if (!setting('ALLURE_TOKEN_CREDENTIALS_ID') && !fileExists('qa-config.json') && provider == 'local') {
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

    // The second pack (CI-08) on VAmPI's secure mode. Its results join the Petstore run above
    // (QA_KEEP_RESULTS), so the archived report covers both packs. The BOLA detection on the
    // vulnerable mode runs in the GitHub workflow.
    stage('e2e (vampi)') {
      steps {
        script {
          withVampiUsers {
            timeout(time: 5, unit: 'MINUTES') {
              shell 'npm run vampi:up'
            }
            withEnv(['QA_KEEP_RESULTS=1'] + reportsOf('vampi')) {
              catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                shell 'npx playwright test --project=api-vampi'
              }
            }
          }
        }
      }
    }

    // The third pack (CI-15), whose `oauth2_client_credentials` auth gets its tokens from the
    // realm's own token endpoint. Like VAmPI's, its results join the archived report and neither
    // the quality gate nor the test-management report covers them.
    stage('e2e (keycloak)') {
      steps {
        script {
          withKeycloakClients {
            timeout(time: 5, unit: 'MINUTES') {
              shell 'npm run keycloak:up'
            }
            withEnv(['QA_KEEP_RESULTS=1'] + reportsOf('keycloak')) {
              catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                shell 'npx playwright test --project=api-keycloak'
              }
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
          junit(testResults: 'reports/junit-*.xml', allowEmptyResults: true)
          if (fileExists('reports/quality-gate.md')) {
            echo readFile('reports/quality-gate.md')
          }
          if (params.PUBLISH_ALLURE) {
            try {
              allure(results: [[path: 'allure-results']])
            } catch (NoSuchMethodError missing) {
              echo 'PUBLISH_ALLURE is on, but this Jenkins has no Allure plugin: the single-file ' +
                'report is archived instead. Set PUBLISH_ALLURE to false to drop this notice.'
            }
          }
        }
      }
      archiveArtifacts(artifacts: 'reports/**, playwright-report/**, allure-results/**', allowEmptyArchive: true)
    }
    failure {
      script {
        shell(returnStatus: true, "docker compose logs --no-color petstore > ${nativePath('reports/petstore.log')} 2>&1")
        shell(returnStatus: true, "docker compose logs --no-color vampi-secure vampi-vulnerable > ${nativePath('reports/vampi.log')} 2>&1")
        shell(returnStatus: true, "docker compose logs --no-color keycloak > ${nativePath('reports/keycloak.log')} 2>&1")
        archiveArtifacts(artifacts: 'reports/petstore.log, reports/vampi.log, reports/keycloak.log', allowEmptyArchive: true)
      }
    }
    cleanup {
      script {
        shell(returnStatus: true, 'npm run petstore:down')
        shell(returnStatus: true, 'npm run vampi:down')
        shell(returnStatus: true, 'npm run keycloak:down')
      }
    }
  }
}

// The variable named by qa-config api.environments.local.packs.petstore.auth.env, from a credential
// when one is configured, otherwise a random value per build; plus the optional port and the
// petstore URL overrides.
def withApiEnvironment(Closure body) {
  List<String> overrides = []
  String port = setting('PETSTORE_PORT')
  if (port) {
    overrides << "PETSTORE_PORT=${port}"
  }
  String baseUrl = setting('PETSTORE_BASE_URL') ?: (port ? "http://localhost:${port}/api/v3" : '')
  String specUrl = setting('PETSTORE_SPEC_URL') ?: (port ? "http://localhost:${port}/api/v3/openapi.json" : '')
  if (baseUrl) {
    overrides << "QA_PETSTORE_BASE_URL=${baseUrl}"
  }
  if (specUrl) {
    overrides << "QA_PETSTORE_SPEC_URL=${specUrl}"
  }
  withEnv(overrides) {
    String keyCredential = setting('API_KEY_CREDENTIALS_ID')
    if (keyCredential) {
      withCredentials([string(credentialsId: keyCredential, variable: 'API_KEY')]) {
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
  String tokenCredential = setting('ALLURE_TOKEN_CREDENTIALS_ID')
  if (!tokenCredential) {
    body()
    return
  }
  withEnv([
    'QA_TM_PROVIDER=allure-testops',
    "ALLURE_ENDPOINT=${setting('ALLURE_ENDPOINT')}",
    "ALLURE_PROJECT_ID=${setting('ALLURE_PROJECT_ID')}",
  ]) {
    withCredentials([string(credentialsId: tokenCredential, variable: 'ALLURE_TOKEN')]) {
      body()
    }
  }
}

// The JUnit file and HTML report folder of one Playwright step (CI-09). Every Playwright process
// writes the reports these variables name, so each step gets its own; the post step publishes
// reports/junit-*.xml and archives playwright-report/ with one folder per step.
def reportsOf(String step) {
  return [
    "QA_JUNIT_REPORT=reports/junit-${step}.xml",
    "PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/${step}",
  ]
}

// The users behind VAmPI's actors user-a and user-b (qa-config, `login` auth): throwaway values
// per build, because the pack registers them on a fresh container. No step prints them, and they
// open nothing outside this build's own containers.
def withVampiUsers(Closure body) {
  Closure word = { UUID.randomUUID().toString().replace('-', '').take(12) }
  withEnv([
    "VAMPI_USER_A_NAME=qa-a-${word()}",
    "VAMPI_USER_A_PASSWORD=${word()}${word()}",
    "VAMPI_USER_B_NAME=qa-b-${word()}",
    "VAMPI_USER_B_PASSWORD=${word()}${word()}",
  ]) {
    body()
  }
}

// The service-account clients of the Keycloak realm (qa-config `actors`), which `keycloak:up`
// imports with these secrets when it starts: throwaway values per build, as in the GitHub job. No
// step prints them, and they open nothing outside this build's own container.
def withKeycloakClients(Closure body) {
  List<String> clients = []
  for (String client : ['ADMIN', 'VIEWER', 'NO_ROLE']) {
    clients << "KEYCLOAK_${client}_CLIENT_ID=qa-${client.toLowerCase().replace('_', '-')}".toString()
    clients << "KEYCLOAK_${client}_CLIENT_SECRET=${UUID.randomUUID().toString().replace('-', '')}".toString()
  }
  withEnv(clients) {
    body()
  }
}

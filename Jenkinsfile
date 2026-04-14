pipeline {
    agent any

    tools {
        nodejs "nodejs"
    }

    environment {
        SONARQUBE = "sonarqube"
    }

    stages {

        stage('Clone') {
            steps {
                git 'https://github.com/dhiahaddeji/PI-BACK.git'
            }
        }

        stage('Install') {
            steps {
                sh 'npm install'
            }
        }

        stage('Test') {
            steps {
                sh 'npm run test || true'
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv("${SONARQUBE}") {
                    sh '''
                    npx sonar-scanner \
                    -Dsonar.projectKey=backend \
                    -Dsonar.sources=. \
                    -Dsonar.host.url=http://localhost:9000 \
                    -Dsonar.login=TON_TOKEN
                    '''
                }
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }
    }
}
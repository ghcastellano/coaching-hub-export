// @ts-nocheck
import axios from 'axios';

const API_BASE_URL = '/api';

class ApiService {
    constructor() {
        this.userEmail = null;
        this.client = axios.create({
            baseURL: API_BASE_URL,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        // Identify the caller on every request so the server can gate the Coaching
        // Hub endpoints by the allowlist (set from the logged-in Jira email).
        this.client.interceptors.request.use((config) => {
            if (this.userEmail) config.headers['x-user-email'] = this.userEmail;
            return config;
        });
    }

    setUserEmail(email) {
        this.userEmail = email || null;
    }

    async testConnection(jiraUrl, email, apiToken) {
        const response = await this.client.post('/jira/test-connection', {
            jiraUrl,
            email,
            apiToken,
        });
        return response.data;
    }

    async getBoards(jiraUrl, email, apiToken, forceRefresh = false) {
        const response = await this.client.post('/jira/boards', {
            jiraUrl,
            email,
            apiToken,
            forceRefresh,
        });
        return response.data;
    }

    async getSprints(jiraUrl, email, apiToken, boardId) {
        const response = await this.client.post('/jira/sprints', {
            jiraUrl,
            email,
            apiToken,
            boardId,
        });
        return response.data;
    }

    async getTeamMetrics(
        jiraUrl,
        email,
        apiToken,
        boardId,
        sprintCount = 6,
        forceRefresh = false,
        sprintIds = null
    ) {
        const body = {
            jiraUrl,
            email,
            apiToken,
            boardId,
            sprintCount,
            forceRefresh,
        };
        if (sprintIds) body.sprintIds = sprintIds;
        const response = await this.client.post('/metrics/team', body);
        return response.data;
    }

    // Cheap freshness probe: 1 Jira call + 1 light DB read on the server.
    async checkStaleness(jiraUrl, email, apiToken, boardId, boardName) {
        const response = await this.client.post('/metrics/staleness', {
            jiraUrl,
            email,
            apiToken,
            boardId,
            boardName,
        });
        return response.data;
    }

    // Cached boards (single tenant)
    async getCachedBoards() {
        const response = await this.client.get('/jira/boards/cached');
        return response.data;
    }

    // History endpoints
    async getBoardsWithHistory() {
        const response = await this.client.get('/history/boards');
        return response.data;
    }

    async getAllLatestMetrics() {
        const response = await this.client.get('/history/all-latest');
        return response.data;
    }

    async getBoardHistory(boardId) {
        const response = await this.client.get(`/history/board/${boardId}`);
        return response.data;
    }

    async getHistoricalMetrics(id) {
        const response = await this.client.get(`/history/metrics/${id}`);
        return response.data;
    }

    async deleteBoard(boardId) {
        const response = await this.client.delete(`/history/board/${boardId}`);
        return response.data;
    }

    // ── Coaching Hub ─────────────────────────────────────────────────────────
    // Pre-aggregated leadership portfolio (engagement status, trends, summary).
    async getCoachingPortfolio() {
        const response = await this.client.get('/coaching/portfolio');
        return response.data;
    }

    async getBoardManagers() {
        const response = await this.client.get('/coaching/board-managers');
        return response.data;
    }

    async saveBoardManager(assignment) {
        const response = await this.client.post('/coaching/board-managers', assignment);
        return response.data;
    }

    // Detect / re-detect the SM from Jira (candidate list is server-owned).
    async detectScrumManager(jiraUrl, email, apiToken, boardId, boardName, sprintCount = 3) {
        const response = await this.client.post('/coaching/detect-sm', {
            jiraUrl,
            email,
            apiToken,
            boardId,
            boardName,
            sprintCount,
        });
        return response.data;
    }

    async getAssessments() {
        const response = await this.client.get('/coaching/assessments');
        return response.data;
    }

    async saveAssessment(boardId, signals, note, author) {
        const response = await this.client.post('/coaching/assessments', {
            boardId,
            signals,
            note,
            author,
        });
        return response.data;
    }

    async getExperiments() {
        const response = await this.client.get('/coaching/experiments');
        return response.data;
    }

    async saveExperiment(experiment) {
        const response = await this.client.post('/coaching/experiments', experiment);
        return response.data;
    }

    async deleteExperiment(id) {
        const response = await this.client.delete(`/coaching/experiments/${id}`);
        return response.data;
    }
}

export default new ApiService();

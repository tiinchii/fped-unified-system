package ph.fped.portal.common;

/** Body of every error response. */
public record ApiError(int status, String message) {}

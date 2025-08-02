using Microsoft.AspNetCore.Mvc;
using Infrastructure.Data;
using Domain;

namespace API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TestController : ControllerBase
    {
        private readonly IMongoRepository<TestEntity> _repository;

        public TestController(IMongoRepository<TestEntity> repository)
        {
            _repository = repository;
        }

        [HttpGet("test-injection")]
        public IActionResult TestInjection()
        {
            return Ok(new
            {
                message = "Repository successfully injected",
                repositoryType = _repository.GetType().Name,
                isBaseMongoRepository = _repository is BaseMongoRepository<TestEntity>
            });
        }
    }
}